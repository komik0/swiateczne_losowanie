const $ = id => document.getElementById(id);
let exclusions = new Set();
// An organizer link grants access only to its own workspace.
const organizerToken = location.hash.startsWith('#admin=') ? location.hash.slice(7) : ''; 
const message = text => $('message').textContent = text;
async function api(path, data) {
  const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'gift-draw', ...(organizerToken ? {'X-Organizer-Token': organizerToken} : {}) }, ...(data === undefined ? {} : {body: JSON.stringify(data)}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Nie udało się wykonać operacji.');
  return result;
}
function node(tag, text, cls) { const el = document.createElement(tag); el.textContent = text; if (cls) el.className = cls; return el; }
function names() { return $('names').value.split('\n').map(n => n.trim()).filter(Boolean); }
function rules() {
  const people = names();
  const box = $('exclusions'); box.replaceChildren();
  if (people.length < 2 || people.length > 100) return;
  box.append(node('h3', 'Kto kogo nie może wylosować?'));
  const details = node('details', ''); details.append(node('summary', 'Ustaw wykluczenia (opcjonalnie)'));
  people.forEach((name, i) => {
    const row = node('fieldset', ''); row.append(node('legend', name + ' nie losuje:'));
    people.forEach((other, j) => {
      if (i === j) return;
      const label = node('label', '', 'check'); const input = document.createElement('input'); input.type = 'checkbox';
      const key = JSON.stringify([name, other]); input.checked = exclusions.has(key);
      input.onchange = () => input.checked ? exclusions.add(key) : exclusions.delete(key);
      label.append(input, document.createTextNode(other)); row.append(label);
    }); details.append(row);
  }); box.append(details);
}
function renderDraw(draw) {
  const box = node('article', '', 'draw'); box.append(node('h3', draw.title), node('p', 'Wyślij każdej osobie wyłącznie jej link. Każdy, kto go ma, może zobaczyć wynik.', 'small'));
  draw.links.forEach(link => {
    const row = node('div', '', 'link-row'); const url = location.origin + '/#wynik=' + link.token;
    const input = document.createElement('input'); input.value = url; input.readOnly = true; input.setAttribute('aria-label', 'Link dla ' + link.name);
    const button = node('button', 'Kopiuj', 'copy'); button.onclick = async () => { try { await navigator.clipboard.writeText(url); button.textContent = 'Skopiowano ✓'; } catch { input.select(); message('Skopiuj zaznaczony link ręcznie.'); } };
    row.append(node('strong', link.name), input, button); box.append(row);
  }); return box;
}
async function history() { const draws = await api('draws'); $('history').replaceChildren(...(draws.length ? draws.map(renderDraw) : [node('p', 'Tutaj pojawią się linki po pierwszym losowaniu.', 'small')])); }
async function init() {
  try {
    if (location.hash.startsWith('#wynik=')) {
      $('result').hidden = false;
      const token = location.hash.slice(7);
      const result = await api('result', {token});
      $('result').append(node('p', result.title, 'eyebrow'), node('div', '🎁', 'gift'), node('h2', 'Cześć, ' + result.giver + '!'), node('p', 'W tym roku kupujesz prezent dla:'), node('h2', result.recipient, 'recipient'), node('p', 'Zachowaj tę małą tajemnicę do świąt. ✧', 'small'));
      return;
    }
    const session = await api('session'); $('login').hidden = session.authenticated; $('admin').hidden = !session.authenticated;
    if (session.authenticated) { $('my-admin-link').value = location.origin + '/#admin=' + organizerToken; await history(); } else if (organizerToken) { message('Nieprawidłowy link administratora. Otwórz zapisany link lub utwórz nowy panel.'); }
  } catch (error) { message(error.message); }
}
$('names').addEventListener('input', rules);
$('create-workspace').onclick = async () => {
  $('create-workspace').disabled = true;
  try { const result = await api('organizers', {}); location.hash = 'admin=' + result.token; location.reload(); }
  catch(e) { message(e.message); $('create-workspace').disabled = false; }
};
$('logout').onclick = async () => { try { await api('logout', {}); location.href = location.pathname; } catch(e) { message(e.message); } };
$('draw-form').onsubmit = async event => {
  event.preventDefault(); message(''); $('submit').disabled = true;
  try {
    const people = names();
    const blocked = [...exclusions].map(key => JSON.parse(key).map(n => people.indexOf(n))).filter(pair => pair.every(i => i >= 0));
    await api('draws', {title: $('title').value, names: people, exclusions: blocked});
    await history(); message('Gotowe! Losowanie zapisane. Rozdaj prywatne linki poniżej.'); $('history').scrollIntoView({behavior: 'smooth'});
  } catch(e) { message(e.message); } finally { $('submit').disabled = false; }
};
init();

$('new-organizer').onclick = async () => {
  try {
    const result = await api('organizers', {});
    const input = $('organizer-link');
    input.value = location.origin + '/#admin=' + result.token;
    $('organizer-share').hidden = false;
    input.focus(); input.select();
    message('Nowy prywatny panel jest gotowy. Skopiuj link i przekaż go znajomemu.');
  } catch(e) { message(e.message); }
};
