/* ---------- persisted settings & helpers ---------- */
function loadSettings() {
  const key = localStorage.getItem('apiKey');
  if (key) document.getElementById('apiKey').value = key;

  const stored = localStorage.getItem('model');
  const allowed = ['o3', 'gpt-4.5-preview', 'o3-pro'];   // added o3-pro
  const model = allowed.includes(stored) ? stored : 'o3';
  document.getElementById('model').value = model;
}

function loadConversation() {
  const conv = localStorage.getItem('conversation');
  return conv ? JSON.parse(conv) : [];
}

function saveConversation(conv) {
  localStorage.setItem('conversation', JSON.stringify(conv));
}

/* ---------- chat window render ---------- */
function renderConversation() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  const conv = loadConversation();
  conv.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'message ' + msg.role;
    const label = msg.role === 'user' ? 'I said:' : 'Chatgpt said:';
    div.textContent = label + '\n' + msg.content;
    chat.appendChild(div);
  });
  chat.scrollTop = chat.scrollHeight;
}

/* ---------- o3-pro state ---------- */
let prevResponseId = localStorage.getItem('o3proPrev') || null;
function persistPrev(id) {
  if (id) { prevResponseId = id; localStorage.setItem('o3proPrev', id); }
}
function clearPrev() {
  prevResponseId = null; localStorage.removeItem('o3proPrev');
}

/* ---------- main send ---------- */
async function sendMessage() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { alert('Please set your API key.'); return; }

  const model = document.getElementById('model').value;
  localStorage.setItem('apiKey', apiKey);
  localStorage.setItem('model', model);

  const conv = loadConversation();
  const content = document.getElementById('userInput').value.trim();
  if (!content) return;
  conv.push({ role: 'user', content });
  document.getElementById('userInput').value = '';
  renderConversation();
  saveConversation(conv);

  try {
    let reply;

    if (model === 'o3-pro') {
      /* ---------- o3-pro branch ---------- */
      const payload = { model: 'o3-pro', input: content };
      if (prevResponseId) payload.previous_response_id = prevResponseId;

      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      /* pull the assistant’s text out exactly like the standalone demo */
      let txt;
      if (Array.isArray(data.output)) {
        for (const part of data.output) {
          if (part.type === 'message' && Array.isArray(part.content)) {
            const chunk = part.content.find(c => c.text);
            if (chunk && chunk.text) { txt = chunk.text; break; }
          }
        }
      }
      if (!txt) txt = data.output_text ?? data.text ?? data.choices?.[0]?.text;
      if (typeof txt !== 'string') txt = '[no reply]';

      reply = txt.trim();
      persistPrev(data.id);

    } else {
      /* ---------- normal chat-completions branch ---------- */
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({ model, messages: conv })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      reply = data.choices[0].message.content.trim();
    }

    conv.push({ role: 'assistant', content: reply });
    saveConversation(conv);
    renderConversation();

  } catch (err) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = 'message error';
    div.textContent = 'Error: ' + (err.message || err.toString());
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }
}

/* ---------- misc buttons ---------- */
function clearConversation() {
  localStorage.removeItem('conversation');
  clearPrev();
  renderConversation();
}

function downloadConversation() {
  const conv = loadConversation();
  const blob = new Blob([JSON.stringify(conv, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'conversation.json';
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- wire-up ---------- */
document.getElementById('saveKey').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  localStorage.setItem('apiKey', key);
});
document.getElementById('send').addEventListener('click', sendMessage);
document.getElementById('clear').addEventListener('click', clearConversation);
document.getElementById('download').addEventListener('click', downloadConversation);

loadSettings();
renderConversation();
