import json
import os
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
import app

class DrawTests(unittest.TestCase):
    def test_perfect_matching(self):
        for n in range(2, 30):
            for _ in range(15):
                result = app.draw([str(i) for i in range(n)], [])
                self.assertEqual(set(result.values()), set(range(n)))
                self.assertTrue(all(i != j for i,j in result.items()))
    def test_constrained(self):
        for _ in range(100):
            self.assertEqual(app.draw(['A','B','C'], [[0,1],[1,2],[2,0]]), {0:2,1:0,2:1})
    def test_impossible(self):
        with self.assertRaises(ValueError): app.draw(['A','B'], [[0,1]])
    def test_invalid(self):
        for names, exclusions in [(['A',' a '], []), (['A'], []), (['A','B'], [[0,9]])]:
            with self.assertRaises(ValueError): app.draw(names, exclusions)

class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        app.DB = cls.tmp.name + '/db.sqlite3'
        os.environ['ADMIN_PASSWORD'] = 'test-password-only'
        cls.server = ThreadingHTTPServer(('127.0.0.1',0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:' + str(cls.server.server_port)
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.tmp.cleanup()
    def call(self, path, data=None, cookie=None, header=True):
        headers = {'Content-Type':'application/json'}
        if header: headers['X-Requested-With'] = 'gift-draw'
        if cookie: headers['Cookie'] = cookie
        req = urllib.request.Request(self.base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers)
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, json.load(response), response.headers
        except urllib.error.HTTPError as e:
            return e.code, json.load(e), e.headers
    def test_end_to_end(self):
        self.assertEqual(self.call('/api/draws')[0],401)
        self.assertEqual(self.call('/api/login', {'password':'bad'})[0],401)
        status, _, headers = self.call('/api/login', {'password':'test-password-only'})
        self.assertEqual(status,200)
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertEqual(self.call('/api/draws', {'names':['A','B']}, cookie, False)[0],403)
        status, draw, _ = self.call('/api/draws', {'title':'Święta','names':['A','B','C'], 'exclusions':[[0,1]]}, cookie)
        self.assertEqual(status,201)
        self.assertNotIn('recipient', json.dumps(draw))
        recipients = []
        for link in draw['links']:
            status, result, _ = self.call('/api/result', {'token':link['token']})
            self.assertEqual(status,200)
            self.assertEqual(result['giver'],link['name'])
            self.assertNotEqual(result['giver'], result['recipient'])
            recipients.append(result['recipient'])
        self.assertEqual(set(recipients), {'A','B','C'})
        self.assertEqual(self.call('/api/result', {'token':'invalid'})[0],404)
        self.assertEqual(len(self.call('/api/draws', cookie=cookie)[1]),1)
        self.call('/api/logout', {}, cookie)
        self.assertEqual(self.call('/api/draws', cookie=cookie)[0],401)

if __name__ == '__main__': unittest.main()
