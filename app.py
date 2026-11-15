import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
DB = os.environ.get('DATABASE_PATH', str(ROOT / 'data' / 'draws.sqlite3'))
SESSIONS = {}

def connect():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute('CREATE TABLE IF NOT EXISTS draws (id TEXT PRIMARY KEY, title TEXT, links TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS organizers (token TEXT PRIMARY KEY)')
    if 'owner' not in [row[1] for row in db.execute('PRAGMA table_info(draws)')]:
        db.execute("ALTER TABLE draws ADD COLUMN owner TEXT NOT NULL DEFAULT ''")
    db.commit()
    db.execute('CREATE TABLE IF NOT EXISTS results (token TEXT PRIMARY KEY, giver TEXT, recipient TEXT, title TEXT)')
    return db

def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()

def draw(names, exclusions):
    """Randomized augmenting-path perfect matching; detects impossible constraints."""
    n = len(names)
    if not 2 <= n <= 100 or any(not isinstance(x, str) or not x.strip() or len(x) > 80 for x in names):
        raise ValueError('Dodaj od 2 do 100 osób (imiona do 80 znaków).')
    if len({x.strip().casefold() for x in names}) != n:
        raise ValueError('Każda osoba musi mieć unikalną nazwę.')
    if not isinstance(exclusions, list) or any(not isinstance(p, list) or len(p) != 2 or any(type(i) is not int or not 0 <= i < n for i in p) for p in exclusions):
        raise ValueError('Nieprawidłowe wykluczenia.')
    blocked = {tuple(p) for p in exclusions}
    choices = [[j for j in range(n) if j != i and (i, j) not in blocked] for i in range(n)]
    rng = secrets.SystemRandom()
    for row in choices:
        rng.shuffle(row)
    owners = {}
    def assign(i, seen):
        for j in choices[i]:
            if j in seen:
                continue
            seen.add(j)
            if j not in owners or assign(owners[j], seen):
                owners[j] = i
                return True
        return False
    order = list(range(n))
    rng.shuffle(order)
    if not all(assign(i, set()) for i in order):
        raise ValueError('Nie da się przeprowadzić losowania z tymi wykluczeniami. Zmień je i spróbuj ponownie.')
    return {i: j for j, i in owners.items()}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # Never log private links or request bodies.

    def send(self, status, body, content_type='application/json; charset=utf-8'):
        data = json.dumps(body, ensure_ascii=False).encode() if isinstance(body, (dict, list)) else body
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(data)

    def owner(self):
        token = self.headers.get('X-Organizer-Token', '')
        if token:
            with connect() as db:
                found = db.execute('SELECT token FROM organizers WHERE token=?', (digest(token),)).fetchone()
            return found[0] if found else None
        return '' if self.admin() else None

    def admin(self):
        cookie = SimpleCookie()
        cookie.load(self.headers.get('Cookie', ''))
        token = cookie.get('session')
        return bool(token and SESSIONS.get(token.value, 0) > time.time())

    def do_GET(self):
        if self.path == '/api/session':
            return self.send(200, {'authenticated': self.owner() is not None})
        if self.path == '/api/draws':
            if self.owner() is None:
                return self.send(401, {'error': 'Zaloguj się jako administrator.'})
            with connect() as db:
                rows = db.execute('SELECT id,title,links FROM draws WHERE owner=? ORDER BY rowid DESC', (self.owner(),)).fetchall()
            return self.send(200, [{'id': i, 'title': t, 'links': json.loads(l)} for i,t,l in rows])
        files = {'/': ('index.html','text/html; charset=utf-8'), '/app.js': ('app.js','text/javascript; charset=utf-8'), '/style.css': ('style.css','text/css; charset=utf-8')}
        if self.path not in files:
            return self.send(404, {'error': 'Nie znaleziono strony.'})
        filename, kind = files[self.path]
        self.send(200, (ROOT / 'public' / filename).read_bytes(), kind)

    def do_POST(self):
        # Custom header prevents cross-site form submissions; no CORS is enabled.
        if self.headers.get('X-Requested-With') != 'gift-draw':
            return self.send(403, {'error': 'Niedozwolone żądanie.'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 65536:
                return self.send(413, {'error': 'Za duże żądanie.'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Nieprawidłowe dane.')
            if self.path == '/api/login':
                password = data.get('password', '')
                expected = os.environ.get('ADMIN_PASSWORD', '')
                if not isinstance(password, str) or not expected or not hmac.compare_digest(digest(password), digest(expected)):
                    time.sleep(0.3)
                    return self.send(401, {'error': 'Nieprawidłowe hasło.'})
                token = secrets.token_urlsafe(32)
                for old in list(SESSIONS):
                    if SESSIONS[old] <= time.time():
                        del SESSIONS[old]
                SESSIONS[token] = time.time() + 28800
                self.send_response(200)
                secure = '; Secure' if os.environ.get('COOKIE_SECURE') == '1' else ''
                self.send_header('Set-Cookie', f'session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                return self.wfile.write(b'{}')
            if self.path == '/api/result':
                token = data.get('token')
                if not isinstance(token, str) or len(token) > 200:
                    raise ValueError('Nieprawidłowy link.')
                with connect() as db:
                    result = db.execute('SELECT giver,recipient,title FROM results WHERE token=?', (digest(token),)).fetchone()
                if not result:
                    return self.send(404, {'error': 'Ten link nie istnieje. Poproś organizatora o poprawny link.'})
                return self.send(200, dict(zip(['giver','recipient','title'], result)))
            if self.owner() is None:
                return self.send(401, {'error': 'Zaloguj się jako administrator.'})
            if self.path == '/api/organizers':
                token = secrets.token_urlsafe(32)
                with connect() as db:
                    db.execute('INSERT INTO organizers VALUES (?)', (digest(token),))
                return self.send(201, {'token': token})
            if self.path == '/api/logout':
                cookie = SimpleCookie(self.headers.get('Cookie',''))
                if cookie.get('session'):
                    SESSIONS.pop(cookie['session'].value, None)
                return self.send(200, {})
            if self.path == '/api/draws':
                names = data.get('names', [])
                if not isinstance(names, list):
                    raise ValueError('Nieprawidłowa lista osób.')
                matching = draw(names, data.get('exclusions', []))
                names = [n.strip() for n in names]
                title = data.get('title', 'Świąteczne losowanie')
                if not isinstance(title, str) or not title.strip() or len(title) > 120:
                    raise ValueError('Podaj nazwę losowania (do 120 znaków).')
                links = [{'name': names[i], 'token': secrets.token_urlsafe(32)} for i in range(len(names))]
                draw_id = secrets.token_urlsafe(16)
                with connect() as db:
                    db.execute('INSERT INTO draws (id,title,links,owner) VALUES (?,?,?,?)', (draw_id, title, json.dumps(links), self.owner()))
                    db.executemany('INSERT INTO results VALUES (?,?,?,?)', [(digest(link['token']), names[i], names[matching[i]], title) for i,link in enumerate(links)])
                return self.send(201, {'id': draw_id, 'title': title, 'links': links})
            self.send(404, {'error': 'Nie znaleziono.'})
        except (ValueError, TypeError, RecursionError):
            import sys
            error = sys.exception()
            self.send(400, {'error': str(error) if isinstance(error, ValueError) else 'Nieprawidłowe dane.'})
        except Exception:
            self.send(500, {'error': 'Błąd serwera. Spróbuj ponownie.'})

if __name__ == '__main__':
    if len(os.environ.get('ADMIN_PASSWORD', '')) < 12:
        raise SystemExit('Ustaw ADMIN_PASSWORD o długości co najmniej 12 znaków.')
    connect().close()
    ThreadingHTTPServer((os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))), Handler).serve_forever()
