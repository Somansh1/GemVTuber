import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

/**
 * ChatApp — Handles the secondary Chat Mode UI and API interaction.
 */
export class ChatApp {
  constructor(overlayManager, configProvider) {
    this.overlayManager = overlayManager;
    this.configProvider = configProvider;

    this.overlay = document.getElementById('chat-app-overlay');
    this.messagesContainer = document.getElementById('chat-app-messages');
    this.inputElement = document.getElementById('chat-app-input');
    this.sendBtn = document.getElementById('chat-app-send-btn');
    this.attachBtn = document.getElementById('chat-app-attach-btn');
    this.screenshotBtn = document.getElementById('chat-app-screenshot-btn');
    this.fileInput = document.getElementById('chat-app-file-input');
    this.previewContainer = document.getElementById('chat-app-image-preview-container');

    this.messages = [];
    this.attachedImages = []; // base64 strings
    this.currentSessionId = null;

    this._setupEventListeners();
  }

  async init() {
    if (window.electronAPI) {
      const sessions = await window.electronAPI.getChatSessions();
      if (sessions && sessions.length > 0) {
        this.currentSessionId = sessions[0].id;
        const history = await window.electronAPI.getChatSession(this.currentSessionId);
        this.messages = history || [];
        this._renderMessages();
      } else {
        this.createNewSession();
      }
    }
  }

  createNewSession() {
    this.currentSessionId = Date.now().toString();
    this.messages = [];
    this._renderMessages();
    this.inputElement.focus();
  }

  async loadSession(id) {
    this.currentSessionId = id;
    if (window.electronAPI) {
      const history = await window.electronAPI.getChatSession(id);
      this.messages = history || [];
      this._renderMessages();
    }
  }

  show() {
    this.overlay.classList.remove('hidden');
    this.inputElement.focus();
    this._scrollToBottom();
  }

  hide() {
    this.overlay.classList.add('hidden');
  }

  _setupEventListeners() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.inputElement.addEventListener('input', () => {
      this.inputElement.style.height = 'auto';
      this.inputElement.style.height = Math.min(this.inputElement.scrollHeight, 120) + 'px';
    });

    this.attachBtn.addEventListener('click', () => {
      this.fileInput.click();
    });

    this.screenshotBtn.addEventListener('click', async () => {
      const base64 = await this._takeScreenshot();
      if (base64) {
        this.attachedImages.push('data:image/jpeg;base64,' + base64);
        this._renderPreviews();
      }
    });

    this.fileInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        for (const file of files) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.attachedImages.push(ev.target.result);
            this._renderPreviews();
          };
          reader.readAsDataURL(file);
        }
      }
      this.fileInput.value = ''; // Reset
    });
  }

  _renderPreviews() {
    if (this.attachedImages.length === 0) {
      this.previewContainer.classList.add('hidden');
      this.previewContainer.innerHTML = '';
      return;
    }

    this.previewContainer.classList.remove('hidden');
    this.previewContainer.innerHTML = '';

    this.attachedImages.forEach((imgSrc, index) => {
      const div = document.createElement('div');
      div.className = 'relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-outline-variant/30 group';
      
      const img = document.createElement('img');
      img.src = imgSrc;
      img.className = 'w-full h-full object-cover';
      
      const rmBtn = document.createElement('button');
      rmBtn.className = 'absolute top-1 right-1 bg-surface-container-highest/80 text-on-surface rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity';
      rmBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">close</span>';
      rmBtn.onclick = () => {
        this.attachedImages.splice(index, 1);
        this._renderPreviews();
      };

      div.appendChild(img);
      div.appendChild(rmBtn);
      this.previewContainer.appendChild(div);
    });
  }

  _scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  _renderMessages() {
    this.messagesContainer.innerHTML = '';
    
    if (this.messages.length === 0) {
      this.messagesContainer.innerHTML = `
        <div class="flex flex-col gap-1.5 items-center justify-center h-full text-on-surface-variant opacity-50">
          <span class="material-symbols-outlined text-4xl">chat_bubble</span>
          <p class="font-body-md text-sm">Start a conversation</p>
        </div>
      `;
      return;
    }

    this.messages.forEach(msg => {
      if (msg.role === 'system') return;
      
      const isUser = msg.role === 'user';
      
      const wrapper = document.createElement('div');
      wrapper.className = `flex mb-4 max-w-[85%] ${isUser ? 'ml-auto justify-end' : 'justify-start'}`;

      const bubble = document.createElement('div');
      bubble.className = `max-w-[85%] px-4 py-3 rounded-2xl shadow-lg backdrop-blur-sm ${
        isUser 
          ? 'bg-primary-container text-on-primary-container rounded-br-sm' 
          : 'bg-surface-variant text-on-surface rounded-bl-sm'
      }`;

      if (Array.isArray(msg.content)) {
        msg.content.forEach(part => {
          if (part.type === 'text') {
            const div = document.createElement('div');
            div.className = 'markdown-body text-[14px] leading-relaxed';
            div.innerHTML = DOMPurify.sanitize(marked.parse(part.text));
            bubble.appendChild(div);
          } else if (part.type === 'image_url') {
            const img = document.createElement('img');
            img.src = part.image_url.url;
            img.className = 'max-w-full rounded-lg mt-2 mb-2 max-h-[300px] object-contain';
            bubble.appendChild(img);
          }
        });
      } else {
        const div = document.createElement('div');
        div.className = 'markdown-body text-[14px] leading-relaxed';
        div.innerHTML = DOMPurify.sanitize(marked.parse(msg.content));
        bubble.appendChild(div);
      }

      wrapper.appendChild(bubble);
      this.messagesContainer.appendChild(wrapper);
    });

    this._scrollToBottom();
  }

  async _saveHistory() {
    if (window.electronAPI && this.currentSessionId) {
      let title = 'New Chat';
      if (this.messages.length > 0) {
        const firstMsg = this.messages[0].content;
        title = typeof firstMsg === 'string' ? firstMsg.substring(0, 30) : 'Chat with Image';
      }
      await window.electronAPI.saveChatSession(this.currentSessionId, title, this.messages);
      window.dispatchEvent(new CustomEvent('chat-sessions-updated'));
    }
  }

  async sendMessage() {
    const text = this.inputElement.value.trim();
    if (!text && this.attachedImages.length === 0) return;

    this.inputElement.value = '';
    this.inputElement.style.height = 'auto';
    
    let content = [];
    if (text) {
      content.push({ type: 'text', text });
    }
    this.attachedImages.forEach(img => {
      content.push({ type: 'image_url', image_url: { url: img } });
    });

    const userMessage = {
      role: 'user',
      content: content.length === 1 && content[0].type === 'text' ? text : content
    };

    this.messages.push(userMessage);
    
    this.attachedImages = [];
    this._renderPreviews();
    this._renderMessages();
    this._saveHistory();

    await this._fetchResponse();
  }

  async _fetchResponse() {
    const config = this.configProvider();
    
    const loadingWrapper = document.createElement('div');
    loadingWrapper.className = `flex max-w-[85%] mb-4`;
    loadingWrapper.innerHTML = `
      <div class="px-4 py-2.5 rounded-2xl text-[14px] font-body-md shadow-sm bg-surface-variant text-on-surface rounded-bl-sm flex items-center gap-2 opacity-70">
        <span class="animate-pulse">...</span>
      </div>
    `;
    this.messagesContainer.appendChild(loadingWrapper);
    this._scrollToBottom();

    try {
      let apiKey = config.chatApiKey;
      if (!apiKey && window.electronAPI) {
        apiKey = await window.electronAPI.getChatApiKey();
      }

      if (!apiKey) {
        throw new Error('Chat API Key is missing. Please add it in Settings.');
      }

      const baseUrl = config.chatBaseUrl || 'https://openrouter.ai/api/v1';
      const endpoint = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
      
      const payload = {
        model: config.chatModelName || 'openai/gpt-4o',
        messages: this.messages,
        max_tokens: config.chatMaxTokens || 4096
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API Error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '(No response)';

      this.messages.push({
        role: 'assistant',
        content: reply
      });
      
      this._saveHistory();

    } catch (err) {
      console.error(err);
      this.messages.push({
        role: 'assistant',
        content: `Error: ${err.message}`
      });
    }

    this._renderMessages();
  }

  async _takeScreenshot() {
    if (!window.electronAPI) return null;
    try {
      const sourceId = await window.electronAPI.getScreenSourceId();
      if (!sourceId) return null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 854,
            maxWidth: 854,
            minHeight: 480,
            maxHeight: 480,
          }
        }
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = 854;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      return dataUrl.split(',')[1];
    } catch (e) {
      console.error('Screenshot failed:', e);
      return null;
    }
  }
}
