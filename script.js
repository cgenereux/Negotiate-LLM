const WORKER_URL = 'https://still-glade-4420.curtisgenereux01.workers.dev';

/* ---------------- helpers to persist conversation locally ------------ */
function loadConversation() {
  return JSON.parse(localStorage.getItem('conv') || '[]');
}
function saveConversation(conv) {
  localStorage.setItem('conv', JSON.stringify(conv));
}
function renderConversation() {
  const box = document.getElementById('conversation');
  box.innerHTML = '';
  loadConversation().forEach(msg => {
    const div = document.createElement('div');
    div.className = msg.role;
    div.textContent = `${msg.role}: ${msg.content}`;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}
function showError(text) {
  alert(text);
}

/* ---------------- main send ---------------- */
async function sendMessage() {
  const input  = document.getElementById('userInput');
  const model  = document.getElementById('model').value || 'gpt-4o';
  const text   = input.value.trim();
  if (!text) return;

  const conv = loadConversation();
  conv.push({ role: 'user', content: text });
  input.value = '';
  saveConversation(conv);
  renderConversation();

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: conv }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data  = await res.json();
    const reply = data.choices[0].message.content.trim();

    conv.push({ role: 'assistant', content: reply });
    saveConversation(conv);
    renderConversation();
  } catch (err) {
    showError(err.message);
  }
}

/* ---------------- wire up UI ---------------- */
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('userInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* initial render */
renderConversation();
