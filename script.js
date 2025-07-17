// URL of your Cloudflare Worker
const WORKER_URL = 'https://still-glade-4d20.curtisgenereux01.workers.dev';
const MODEL = 'o3';

/* ---- local storage helpers ---- */
function loadConversation() {
  return JSON.parse(localStorage.getItem('conv') || '[]');
}
function saveConversation(conv) {
  localStorage.setItem('conv', JSON.stringify(conv));
}

/* ---- render chat ---- */
function render() {
  const box = document.getElementById('chat');
  box.innerHTML = '';
  loadConversation().forEach(m => {
    const div = document.createElement('div');
    div.className = 'message ' + m.role;
    div.textContent = (m.role === 'user' ? 'You: ' : 'AI: ') + m.content;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

/* ---- send ---- */
async function sendMessage() {
  const input = document.getElementById('userInput');
  const text  = input.value.trim();
  if (!text) return;

  const conv = loadConversation();
  conv.push({ role: 'user', content: text });
  saveConversation(conv);
  render();
  input.value = '';

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: conv })
    });
    if (!res.ok) throw new Error(await res.text());
    const data  = await res.json();
    const reply = data.choices[0].message.content.trim();

    conv.push({ role: 'assistant', content: reply });
    saveConversation(conv);
    render();
  } catch (err) {
    alert(err.message);
  }
}

/* ---- buttons ---- */
document.getElementById('send').addEventListener('click', sendMessage);
document.getElementById('userInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
document.getElementById('clear').addEventListener('click', () => {
  localStorage.removeItem('conv');
  render();
});
document.getElementById('download').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify(loadConversation(), null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {
    href: url,
    download: 'conversation.json'
  }).click();
  URL.revokeObjectURL(url);
});

/* ---- init ---- */
render();
