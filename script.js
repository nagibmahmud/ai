class AIHub {
    constructor() {
        this.apiKey = localStorage.getItem('geminiApiKey') || '';
        this.model = localStorage.getItem('geminiModel') || 'gemini-2.0-flash';
        this.temperature = parseFloat(localStorage.getItem('temperature')) || 0.8;
        this.maxTokens = parseInt(localStorage.getItem('maxTokens')) || 4096;
        this.theme = 0;
        this.soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
        this.conversations = JSON.parse(localStorage.getItem('conversations') || '[]');
        this.activeConvId = localStorage.getItem('activeConvId') || null;
        this.editingMsgId = null;
        this.searchIndex = -1;
        this.searchMatches = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.initParticles();
        this.initAudio();
        this.updateTime();
        setInterval(() => this.updateTime(), 1000);
        this.loadingSequence();
        this.updateSystemStatus();
        this.updateSoundIcon();
        this.initEmojiPicker();
        if (this.conversations.length === 0) this.createConversation();
        else {
            if (!this.activeConvId || !this.conversations.find(c => c.id === this.activeConvId)) {
                this.activeConvId = this.conversations[this.conversations.length - 1].id;
            }
            this.renderConversations();
            this.loadConversation(this.activeConvId);
        }
    }

    generateId() { return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9); }

    createConversation() {
        const conv = { id: this.generateId(), title: 'New Quantum Chat', messages: [], createdAt: Date.now() };
        this.conversations.push(conv);
        this.activeConvId = conv.id;
        this.saveConversations();
        this.renderConversations();
        this.loadConversation(conv.id);
    }

    deleteConversation(id) {
        this.conversations = this.conversations.filter(c => c.id !== id);
        if (this.activeConvId === id) {
            this.activeConvId = this.conversations.length > 0 ? this.conversations[this.conversations.length - 1].id : null;
        }
        if (this.conversations.length === 0) this.createConversation();
        else {
            this.saveConversations();
            this.renderConversations();
            this.loadConversation(this.activeConvId);
        }
    }

    switchConversation(id) {
        if (id === this.activeConvId) return;
        this.activeConvId = id;
        localStorage.setItem('activeConvId', id);
        this.renderConversations();
        this.loadConversation(id);
    }

    saveConversations() {
        try { localStorage.setItem('conversations', JSON.stringify(this.conversations)); } catch (e) {}
    }

    getActiveConv() { return this.conversations.find(c => c.id === this.activeConvId); }

    renderConversations() {
        const list = document.getElementById('conversationsList');
        list.innerHTML = '';
        const sorted = [...this.conversations].sort((a, b) => b.createdAt - a.createdAt);
        sorted.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conv-item' + (conv.id === this.activeConvId ? ' active' : '');
            item.innerHTML = `<span class="conv-item-title">${this.escapeHtml(conv.title)}</span>
                <button class="conv-item-delete" data-id="${conv.id}">&#10005;</button>`;
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('conv-item-delete')) return;
                this.playSound('click');
                this.switchConversation(conv.id);
            });
            item.querySelector('.conv-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.playSound('close');
                this.deleteConversation(conv.id);
            });
            list.appendChild(item);
        });
    }

    loadConversation(id) {
        const conv = this.conversations.find(c => c.id === id);
        if (!conv) return;
        const messages = document.getElementById('messages');
        const welcome = document.getElementById('welcome');
        messages.innerHTML = '';
        if (conv.messages.length === 0) {
            welcome.style.display = 'block';
        } else {
            welcome.style.display = 'none';
            conv.messages.forEach(msg => this.renderMessage(msg.role, msg.content, false));
        }
        this.scrollToBottom();
    }

    loadingSequence() {
        const loading = document.getElementById('loadingScreen');
        const texts = ['INITIALIZING', 'LOADING NEURAL NET', 'SYNCING QUANTUM CORE', 'SYSTEM READY'];
        let i = 0;
        const textEl = loading.querySelector('.loading-text');
        const interval = setInterval(() => {
            if (textEl) textEl.textContent = texts[i];
            i++;
            if (i >= texts.length) {
                clearInterval(interval);
                setTimeout(() => {
                    loading.style.opacity = '0';
                    setTimeout(() => {
                        loading.style.display = 'none';
                        this.playSound('startup');
                        this.showWelcomeMessage();
                    }, 800);
                }, 500);
            }
        }, 600);
    }

    showWelcomeMessage() {
        const hour = new Date().getHours();
        let greeting = 'GOOD EVENING';
        if (hour < 12) greeting = 'GOOD MORNING';
        else if (hour < 18) greeting = 'GOOD AFTERNOON';
        setTimeout(() => {
            this.addMessage('assistant',
                `**${greeting}!**\n\nI'm **MAXIT AI**, your quantum neural interface.\n\n` +
                `**Online Systems:**\n` +
                `- Neural Core: Active\n` +
                `- Knowledge Base: Loaded\n` +
                `- Response Matrix: Ready\n\n` +
                `*How can I assist you today?*`
            );
        }, 500);
    }

    bindEvents() {
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', (e) => {
                this.playSound('click');
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.switchFeature(e.currentTarget.dataset.view);
            });
        });

        const sendBtn = document.getElementById('sendBtn');
        sendBtn.addEventListener('click', () => { this.playSound('send'); this.send(); });
        sendBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.playSound('send'); this.send(); });
        
        const input = document.getElementById('input');
        input.addEventListener('touchstart', (e) => { e.stopPropagation(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.playSound('send'); this.send(); }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 150) + 'px';
            document.getElementById('charCount').textContent = input.value.length;
        });

        document.querySelectorAll('.suggestion').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.playSound('click');
                document.getElementById('input').value = e.currentTarget.dataset.msg;
                this.send();
            });
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.playSound('open');
            document.getElementById('settingsModal').style.display = 'flex';
            document.getElementById('apiKey').value = this.apiKey;
            document.getElementById('modelSelect').value = this.model;
            document.getElementById('temperature').value = this.temperature;
            document.getElementById('temperatureValue').textContent = this.temperature;
            document.getElementById('maxTokens').value = this.maxTokens;
        });
        document.getElementById('closeSettings').addEventListener('click', () => { this.playSound('close'); document.getElementById('settingsModal').style.display = 'none'; });
        document.getElementById('apiKey').addEventListener('change', () => this.saveSettings());
        document.getElementById('modelSelect').addEventListener('change', () => this.saveSettings());
        document.getElementById('temperature').addEventListener('input', (e) => {
            this.temperature = parseFloat(e.target.value);
            document.getElementById('temperatureValue').textContent = this.temperature;
            localStorage.setItem('temperature', this.temperature);
        });
        document.getElementById('maxTokens').addEventListener('change', (e) => {
            this.maxTokens = parseInt(e.target.value);
            localStorage.setItem('maxTokens', this.maxTokens);
        });
        document.getElementById('themeToggle').addEventListener('click', () => { this.playSound('toggle'); this.cycleTheme(); });

        document.getElementById('settingsModal').addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') { this.playSound('close'); document.getElementById('settingsModal').style.display = 'none'; }
        });

        document.getElementById('btnNewChat').addEventListener('click', () => { this.playSound('click'); this.createConversation(); });

        document.getElementById('searchBtn').addEventListener('click', () => { this.playSound('open'); this.toggleSearch(); });
        document.getElementById('searchClose').addEventListener('click', () => this.toggleSearch());
        document.getElementById('searchInput').addEventListener('input', (e) => this.performSearch(e.target.value));
        document.getElementById('searchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.navigateSearch(1); }
        });

        document.getElementById('exportBtn').addEventListener('click', () => { this.playSound('open'); document.getElementById('exportModal').style.display = 'flex'; });
        document.getElementById('closeExport').addEventListener('click', () => { this.playSound('close'); document.getElementById('exportModal').style.display = 'none'; });
        document.getElementById('exportModal').addEventListener('click', (e) => {
            if (e.target.id === 'exportModal') { this.playSound('close'); document.getElementById('exportModal').style.display = 'none'; }
        });
        document.getElementById('exportMarkdown').addEventListener('click', () => this.exportChat('md'));
        document.getElementById('exportText').addEventListener('click', () => this.exportChat('txt'));
        document.getElementById('exportJson').addEventListener('click', () => this.exportChat('json'));

        document.getElementById('clearChatBtn').addEventListener('click', () => { this.playSound('close'); this.clearChat(); });

        document.getElementById('shortcutsBtn').addEventListener('click', () => { this.playSound('open'); document.getElementById('shortcutsModal').style.display = 'flex'; });
        document.getElementById('closeShortcuts').addEventListener('click', () => { this.playSound('close'); document.getElementById('shortcutsModal').style.display = 'none'; });
        document.getElementById('shortcutsModal').addEventListener('click', (e) => {
            if (e.target.id === 'shortcutsModal') { this.playSound('close'); document.getElementById('shortcutsModal').style.display = 'none'; }
        });

        document.getElementById('soundToggle').addEventListener('click', () => {
            this.soundEnabled = !this.soundEnabled;
            localStorage.setItem('soundEnabled', this.soundEnabled);
            this.updateSoundIcon();
            if (this.soundEnabled) this.playSound('click');
        });

        document.getElementById('voiceBtn').addEventListener('click', () => this.toggleVoice());
        document.getElementById('emojiBtn').addEventListener('click', () => {
            const picker = document.getElementById('emojiPicker');
            picker.classList.toggle('active');
        });

        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            this.createRipple(e);
            const picker = document.getElementById('emojiPicker');
            if (picker.classList.contains('active') && !document.getElementById('emojiBtn').contains(e.target) && !picker.contains(e.target)) {
                picker.classList.remove('active');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('settingsModal').style.display = 'none';
                document.getElementById('shortcutsModal').style.display = 'none';
                document.getElementById('exportModal').style.display = 'none';
                document.getElementById('emojiPicker').classList.remove('active');
                const searchBar = document.getElementById('searchBar');
                if (searchBar.classList.contains('active')) this.toggleSearch();
            }
            if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('input').focus(); }
            if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this.send(); }
            if (e.ctrlKey && e.key === 'f') { e.preventDefault(); this.toggleSearch(); }
            if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this.createConversation(); }
            if (e.ctrlKey && e.key === 'e') { e.preventDefault(); document.getElementById('exportModal').style.display = 'flex'; }
        });
    }

    createRipple(e) {
        const ripple = document.createElement('div');
        ripple.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:20px;height:20px;background:radial-gradient(circle,rgba(0,255,255,0.4),transparent);border-radius:50%;pointer-events:none;z-index:9999;animation:ripple 0.6s ease-out forwards`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    switchFeature(feature) {
        const titles = { chat: 'QUANTUM CHAT', image: 'VISION ANALYSIS', code: 'CODE SYNTHESIS', creative: 'CREATIVE MATRIX' };
        const titleEl = document.getElementById('viewTitle');
        titleEl.style.opacity = '0';
        setTimeout(() => { titleEl.textContent = titles[feature] || 'CHAT'; titleEl.style.opacity = '1'; }, 200);
        const placeholders = { chat: 'Ask anything...', image: 'Upload image for analysis...', code: 'Describe your code...', creative: 'Create something amazing...' };
        const input = document.getElementById('input');
        input.placeholder = placeholders[feature] || '...';
        input.focus();
    }

    send() {
        const input = document.getElementById('input');
        const msg = input.value.trim();
        if (!msg) return;
        const conv = this.getActiveConv();
        if (!conv) return;

        if (conv.messages.length === 0) {
            conv.title = msg.substring(0, 40) + (msg.length > 40 ? '...' : '');
            this.renderConversations();
        }

        conv.messages.push({ role: 'user', content: msg, timestamp: Date.now() });
        this.saveConversations();
        this.renderMessage('user', msg);
        input.value = '';
        input.style.height = 'auto';
        document.getElementById('charCount').textContent = '0';
        document.getElementById('welcome').style.display = 'none';
        this.showTyping();
        this.scrollToBottom();
        this.getResponse(msg);
    }

    renderMessage(role, content, save = true) {
        const messages = document.getElementById('messages');
        const div = document.createElement('div');
        div.className = 'message ' + role;
        const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        div.dataset.msgId = msgId;

        const avatar = role === 'user' ? '&#128100;' : '&#129302;';
        const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                ${this.format(content)}
                <div class="message-footer">
                    <span class="message-timestamp">${time}</span>
                    ${role === 'assistant' ? `
                    <div class="message-actions">
                        <button class="btn-msg-action btn-copy" title="Copy">&#128203;</button>
                        <button class="btn-msg-action btn-like" title="Like">&#9825;</button>
                        <button class="btn-msg-action btn-dislike" title="Dislike">&#9825;</button>
                        <button class="btn-msg-action btn-pin" title="Pin">&#128204;</button>
                    </div>` : `
                    <div class="message-actions">
                        <button class="btn-msg-action btn-edit" title="Edit">&#9998;</button>
                        <button class="btn-msg-action btn-delete-msg" title="Delete">&#128465;</button>
                    </div>`}
                </div>
            </div>`;

        div.querySelector('.btn-copy').addEventListener('click', () => {
            navigator.clipboard.writeText(content);
            this.showNotification('Copied to clipboard');
        });

        if (role === 'assistant') {
            div.querySelector('.btn-like').addEventListener('click', function() {
                this.classList.toggle('liked');
                if (this.classList.contains('liked')) div.querySelector('.btn-dislike').classList.remove('disliked');
            });
            div.querySelector('.btn-dislike').addEventListener('click', function() {
                this.classList.toggle('disliked');
                if (this.classList.contains('disliked')) div.querySelector('.btn-like').classList.remove('liked');
            });
            div.querySelector('.btn-pin').addEventListener('click', function() {
                div.classList.toggle('pinned');
                this.classList.toggle('pinned');
                if (div.classList.contains('pinned')) {
                    if (!div.querySelector('.pin-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'pin-badge';
                        badge.textContent = '&#128204; PINNED';
                        div.querySelector('.message-content').insertBefore(badge, div.querySelector('.message-footer'));
                    }
                } else {
                    const badge = div.querySelector('.pin-badge');
                    if (badge) badge.remove();
                }
            });
        }

        if (role === 'user') {
            div.querySelector('.btn-edit').addEventListener('click', () => this.editMessage(div, msgId));
            div.querySelector('.btn-delete-msg').addEventListener('click', () => {
                div.style.opacity = '0';
                div.style.transform = 'scale(0.8)';
                setTimeout(() => {
                    div.remove();
                    const conv = this.getActiveConv();
                    if (conv) {
                        conv.messages = conv.messages.filter(m => !(m.role === role && m.content === content));
                        this.saveConversations();
                    }
                }, 300);
            });
        }

        messages.appendChild(div);
        this.scrollToBottom();
    }

    editMessage(div, msgId) {
        if (this.editingMsgId) return;
        this.editingMsgId = msgId;
        const contentEl = div.querySelector('.message-content');
        const currentText = div.dataset.originalContent || contentEl.querySelector('.message-footer').previousSibling.textContent.trim();
        const existingFormatted = contentEl.innerHTML;
        const rawText = this.unformat(existingFormatted);

        const footer = contentEl.querySelector('.message-footer');
        const editArea = document.createElement('textarea');
        editArea.className = 'message-edit-area';
        editArea.value = rawText;
        contentEl.insertBefore(editArea, footer);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-edit-actions';
        actionsDiv.innerHTML = `<button class="btn-edit-save">Save</button><button class="btn-edit-cancel">Cancel</button>`;
        contentEl.insertBefore(actionsDiv, footer);

        const originalContent = contentEl.innerHTML;

        actionsDiv.querySelector('.btn-edit-save').addEventListener('click', () => {
            const newText = editArea.value.trim();
            if (newText) {
                const conv = this.getActiveConv();
                if (conv) {
                    const msgIdx = conv.messages.findIndex(m => m.content === rawText && m.role === 'user');
                    if (msgIdx !== -1) {
                        conv.messages[msgIdx].content = newText;
                        this.saveConversations();
                    }
                }
                contentEl.innerHTML = contentEl.innerHTML.replace(editArea.outerHTML, this.format(newText));
                contentEl.querySelector('.message-edit-actions')?.remove();
            }
            this.editingMsgId = null;
        });

        actionsDiv.querySelector('.btn-edit-cancel').addEventListener('click', () => {
            contentEl.innerHTML = existingFormatted;
            this.editingMsgId = null;
        });
    }

    unformat(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    format(text) {
        let formatted = text;
        formatted = formatted.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'code';
            return `<div class="code-header"><span class="code-lang">${language}</span><button class="btn-copy-code" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)">Copy</button></div><pre><code>${this.escapeHtml(code.trim())}</code></pre>`;
        });
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        formatted = formatted.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        formatted = formatted.replace(/^---$/gm, '<hr>');
        formatted = formatted.replace(/^\|(.+)\|$/gm, (match) => {
            const cells = match.split('|').filter(c => c.trim());
            if (cells.every(c => /^[\s-:]+$/.test(c))) return '<!--table-sep-->';
            return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
        });
        formatted = formatted.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>');
        formatted = formatted.replace(/<!--table-sep-->\n?/g, '');
        formatted = formatted.replace(/^- (.+)$/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/gs, (match) => {
            if (match.includes('<ul>')) return match;
            return '<ul>' + match + '</ul>';
        });
        formatted = formatted.replace(/\n/g, '<br>');
        formatted = formatted.replace(/<br>(<h[1-4]>)/g, '$1');
        formatted = formatted.replace(/(<\/h[1-4]>)<br>/g, '$1');
        formatted = formatted.replace(/<br>(<ul>)/g, '$1');
        formatted = formatted.replace(/(<\/ul>)<br>/g, '$1');
        formatted = formatted.replace(/<br>(<pre>)/g, '$1');
        formatted = formatted.replace(/(<\/pre>)<br>/g, '$1');
        formatted = formatted.replace(/<br>(<table>)/g, '$1');
        formatted = formatted.replace(/(<\/table>)<br>/g, '$1');
        formatted = formatted.replace(/<br>(<blockquote>)/g, '$1');
        formatted = formatted.replace(/(<\/blockquote>)<br>/g, '$1');
        formatted = formatted.replace(/<br>(<hr>)/g, '$1');
        return formatted;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showTyping() {
        const messages = document.getElementById('messages');
        const typing = document.createElement('div');
        typing.className = 'message assistant';
        typing.id = 'typing';
        typing.innerHTML = `<div class="message-avatar">&#129302;</div><div class="message-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
        messages.appendChild(typing);
        this.scrollToBottom();
    }

    hideTyping() {
        const t = document.getElementById('typing');
        if (t) { t.style.opacity = '0'; t.style.transform = 'scale(0.8)'; setTimeout(() => t.remove(), 200); }
    }

    async getResponse(msg) {
        if (!this.apiKey) {
            this.hideTyping();
            this.addMessage('assistant', this.fallback(msg));
            this.playSound('response');
            return;
        }
        try {
            const conv = this.getActiveConv();
            const history = conv ? conv.messages.slice(-20).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })) : [];
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + this.model + ':generateContent?key=' + this.apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: history,
                    generationConfig: { temperature: this.temperature, topK: 64, topP: 0.95, maxOutputTokens: this.maxTokens }
                })
            });
            const data = await res.json();
            this.hideTyping();
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                const response = data.candidates[0].content.parts[0].text;
                this.addMessage('assistant', response);
                this.playSound('response');
            } else {
                this.addMessage('assistant', 'No response from quantum core.');
                this.playSound('error');
            }
        } catch (err) {
            this.hideTyping();
            this.addMessage('assistant', this.fallback(msg));
            this.playSound('error');
        }
    }

    addMessage(role, content) {
        const conv = this.getActiveConv();
        if (!conv) return;
        conv.messages.push({ role, content, timestamp: Date.now() });
        this.saveConversations();
        this.renderMessage(role, content);
    }

    fallback(msg) {
        const m = msg.toLowerCase();
        const responses = {
            greeting: ['**Hello there!** I'm MAXIT AI - your quantum assistant. How can I help you today?', '**Hey!** Ready to explore the digital realm. What would you like to create?'],
            code: ['I can help you write code! What programming language do you prefer - JavaScript, Python, or something else?', 'Let\'s build something amazing! What\'s your idea?'],
            help: ['I\'m here to help! Ask me anything - code, creative writing, or just chat.', 'You can ask me about coding, writing, or any questions. What\'s on your mind?'],
            thanks: ['You\'re welcome! Anything else I can help with?', 'Happy to help! Feel free to ask more.'],
            bye: ['Goodbye! Come back anytime!', 'Take care! See you soon.'],
            name: ['I\'m MAXIT AI - your intelligent assistant built with quantum technology!', 'I\'m MAXIT, an AI assistant designed to help you with any task!'],
            who: ['I\'m MAXIT AI, created to assist you with coding, writing, and more!', 'I\'m your AI assistant - smart, helpful, and always ready to chat!']
        };
        if (m.includes('hello') || m.includes('hi') || m.includes('hey') || m.includes('hey')) return responses.greeting[Math.floor(Math.random() * responses.greeting.length)];
        if (m.includes('code') || m.includes('program') || m.includes('function') || m.includes('python') || m.includes('javascript')) return responses.code[Math.floor(Math.random() * responses.code.length)];
        if (m.includes('help') || m.includes('what can you do')) return responses.help[Math.floor(Math.random() * responses.help.length)];
        if (m.includes('thank') || m.includes('thanks')) return responses.thanks[Math.floor(Math.random() * responses.thanks.length)];
        if (m.includes('bye') || m.includes('goodbye') || m.includes('see you')) return responses.bye[Math.floor(Math.random() * responses.bye.length)];
        if (m.includes('who are you') || m.includes('your name')) return responses.who[Math.floor(Math.random() * responses.who.length)];
        if (m.includes('?')) {
            return `**Great question!**\n\nThat's something I'd love to help you explore. Tell me more about what you need, and I'll do my best to assist you.\n\n*What specific help do you need?*`;
        }
        return `**I understand!**\n\n"${msg}" - That's interesting! Tell me more about what you need, or ask me to help with coding, writing, or any project you're working on.\n\n*How can I assist you further?*`;
    }

    saveSettings() {
        this.apiKey = document.getElementById('apiKey').value.trim();
        this.model = document.getElementById('modelSelect').value;
        localStorage.setItem('geminiApiKey', this.apiKey);
        localStorage.setItem('geminiModel', this.model);
        this.updateSystemStatus();
        this.playSound('success');
    }

    updateSystemStatus() {
        const s = document.getElementById('systemStatusText');
        if (this.apiKey) { s.textContent = 'GEMINI QUANTUM CORE'; s.style.color = '#0ff'; }
        else { s.textContent = 'LOCAL NEURAL NET'; s.style.color = '#0f0'; }
    }

    cycleTheme() {
        const themes = [
            { name: 'cyberpunk', cyan: '#00ffff', magenta: '#ff00ff', purple: '#8000ff' },
            { name: 'ocean', cyan: '#0080ff', magenta: '#00ffff', purple: '#0000ff' },
            { name: 'sunset', cyan: '#ff8000', magenta: '#ff0080', purple: '#8000ff' },
            { name: 'matrix', cyan: '#00ff00', magenta: '#008000', purple: '#004000' },
            { name: 'neon', cyan: '#ff00ff', magenta: '#00ffff', purple: '#ffff00' }
        ];
        this.theme = (this.theme + 1) % themes.length;
        const t = themes[this.theme];
        document.documentElement.style.setProperty('--neon-cyan', t.cyan);
        document.documentElement.style.setProperty('--neon-magenta', t.magenta);
        document.documentElement.style.setProperty('--neon-purple', t.purple);
        document.body.setAttribute('data-theme', t.name);
        this.showNotification('Theme: ' + t.name.toUpperCase());
    }

    updateTime() {
        const t = new Date();
        const time = t.toLocaleTimeString('en-US', { hour12: false });
        const date = t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        document.getElementById('headerTime').textContent = date + ' • ' + time;
    }

    initParticles() {
        const c = document.getElementById('bgParticles');
        if (!c) return;
        for (let i = 0; i < 60; i++) {
            const p = document.createElement('div');
            const colors = ['#0ff', '#f0f', '#0f8', '#80f', '#ff0'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 5 + 2;
            p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${color};border-radius:50%;box-shadow:0 0 ${Math.random()*15+5}px ${color};left:${Math.random()*100}%;top:${Math.random()*100}%;opacity:${Math.random()*0.8+0.2};transition:opacity 0.3s`;
            p.dx = (Math.random() - 0.5) * 3;
            p.dy = (Math.random() - 0.5) * 3;
            p.speed = Math.random() * 2 + 0.5;
            c.appendChild(p);
            setInterval(() => {
                let x = parseFloat(p.style.left);
                let y = parseFloat(p.style.top);
                x += p.dx * p.speed;
                y += p.dy * p.speed;
                if (x < 0 || x > 100) { p.dx *= -1; p.style.opacity = '0.3'; }
                if (y < 0 || y > 100) { p.dy *= -1; p.style.opacity = '0.3'; }
                if (p.style.opacity === '0.3') setTimeout(() => p.style.opacity = '1', 300);
                p.style.left = x + '%';
                p.style.top = y + '%';
            }, 50);
        }
    }

    initAudio() { this.audioContext = null; }

    playSound(type) {
        if (!this.soundEnabled) return;
        try {
            if (!this.audioContext) this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            const sounds = {
                click: { freq: 800, duration: 0.08, type: 'sine' },
                send: { freq: 600, duration: 0.12, type: 'triangle' },
                open: { freq: 1000, duration: 0.15, type: 'sine' },
                close: { freq: 400, duration: 0.1, type: 'sawtooth' },
                toggle: { freq: 1200, duration: 0.1, type: 'square' },
                success: { freq: 880, duration: 0.25, type: 'sine' },
                error: { freq: 220, duration: 0.3, type: 'sawtooth' },
                response: { freq: 1046, duration: 0.1, type: 'sine' },
                startup: { freq: 440, duration: 0.5, type: 'sine' }
            };
            const s = sounds[type] || sounds.click;
            osc.frequency.setValueAtTime(s.freq, this.audioContext.currentTime);
            osc.type = s.type;
            gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + s.duration);
            osc.start(this.audioContext.currentTime);
            osc.stop(this.audioContext.currentTime + s.duration);
        } catch (e) {}
    }

    updateSoundIcon() {
        const btn = document.getElementById('soundToggle');
        if (this.soundEnabled) btn.classList.remove('muted');
        else btn.classList.add('muted');
    }

    showNotification(text) {
        const notif = document.createElement('div');
        notif.style.cssText = `position:fixed;top:80px;right:20px;background:linear-gradient(135deg,#0ff,#f0f);color:#000;padding:12px 24px;border-radius:8px;font-family:'Orbitron',sans-serif;font-weight:700;font-size:14px;z-index:10000;box-shadow:0 0 30px rgba(0,255,255,0.5);animation:slideIn 0.3s ease,slideOut 0.3s ease 2s forwards`;
        notif.textContent = text;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 2300);
    }

    scrollToBottom() {
        const chatArea = document.getElementById('chatArea');
        setTimeout(() => { chatArea.scrollTop = chatArea.scrollHeight; }, 50);
    }

    clearChat() {
        const conv = this.getActiveConv();
        if (!conv) return;
        conv.messages = [];
        conv.title = 'New Quantum Chat';
        conv.createdAt = Date.now();
        this.saveConversations();
        this.renderConversations();
        this.loadConversation(conv.id);
        this.showNotification('CHAT CLEARED');
    }

    toggleSearch() {
        const bar = document.getElementById('searchBar');
        bar.classList.toggle('active');
        if (bar.classList.contains('active')) {
            document.getElementById('searchInput').focus();
            this.clearSearchHighlights();
        } else {
            document.getElementById('searchInput').value = '';
            this.clearSearchHighlights();
        }
    }

    performSearch(query) {
        this.clearSearchHighlights();
        this.searchMatches = [];
        this.searchIndex = -1;
        if (!query || query.length < 2) {
            document.getElementById('searchCount').textContent = '0/0';
            return;
        }
        const messages = document.getElementById('messages');
        const msgEls = messages.querySelectorAll('.message');
        const lowerQuery = query.toLowerCase();
        msgEls.forEach((el, i) => {
            const contentEl = el.querySelector('.message-content');
            const textNodes = this.getTextNodes(contentEl);
            textNodes.forEach(node => {
                const text = node.textContent;
                const lowerText = text.toLowerCase();
                let idx = lowerText.indexOf(lowerQuery);
                if (idx !== -1) {
                    this.searchMatches.push({ element: el, node, index: idx });
                    const range = document.createRange();
                    const frag = document.createDocumentFragment();
                    let lastIndex = 0;
                    while (idx !== -1) {
                        if (idx > lastIndex) frag.appendChild(document.createTextNode(text.substring(lastIndex, idx)));
                        const span = document.createElement('span');
                        span.className = 'search-highlight';
                        span.textContent = text.substring(idx, idx + query.length);
                        frag.appendChild(span);
                        lastIndex = idx + query.length;
                        idx = lowerText.indexOf(lowerQuery, lastIndex);
                    }
                    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.substring(lastIndex)));
                    node.parentNode.replaceChild(frag, node);
                }
            });
        });
        document.getElementById('searchCount').textContent = this.searchMatches.length > 0 ? `1/${this.searchMatches.length}` : '0/0';
        if (this.searchMatches.length > 0) {
            this.searchIndex = 0;
            this.highlightCurrentSearch();
        }
    }

    getTextNodes(el) {
        const nodes = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement.tagName !== 'SCRIPT' && node.parentElement.tagName !== 'STYLE') nodes.push(node);
        }
        return nodes;
    }

    navigateSearch(dir) {
        if (this.searchMatches.length === 0) return;
        this.searchIndex = (this.searchIndex + dir + this.searchMatches.length) % this.searchMatches.length;
        this.highlightCurrentSearch();
    }

    highlightCurrentSearch() {
        document.querySelectorAll('.search-highlight.active').forEach(el => el.classList.remove('active'));
        if (this.searchIndex >= 0 && this.searchIndex < this.searchMatches.length) {
            const match = this.searchMatches[this.searchIndex];
            const highlights = match.element.querySelectorAll('.search-highlight');
            if (highlights.length > 0) {
                highlights[0].classList.add('active');
                highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            document.getElementById('searchCount').textContent = `${this.searchIndex + 1}/${this.searchMatches.length}`;
        }
    }

    clearSearchHighlights() {
        document.querySelectorAll('.search-highlight').forEach(el => {
            const parent = el.parentNode;
            parent.replaceChild(document.createTextNode(el.textContent), el);
            parent.normalize();
        });
    }

    exportChat(format) {
        const conv = this.getActiveConv();
        if (!conv || conv.messages.length === 0) { this.showNotification('No messages to export'); return; }
        let content, filename, type;
        if (format === 'md') {
            content = `# ${conv.title}\n\nExported: ${new Date().toLocaleString()}\n\n---\n\n`;
            conv.messages.forEach(m => {
                content += `### ${m.role === 'user' ? 'User' : 'MAXIT AI'}\n\n${m.content}\n\n`;
            });
            filename = conv.title.replace(/[^a-zA-Z0-9]/g, '_') + '.md';
            type = 'text/markdown';
        } else if (format === 'txt') {
            content = `${conv.title}\n${'='.repeat(50)}\nExported: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
            conv.messages.forEach(m => {
                content += `[${m.role === 'user' ? 'USER' : 'AI'}] ${m.content}\n\n`;
            });
            filename = conv.title.replace(/[^a-zA-Z0-9]/g, '_') + '.txt';
            type = 'text/plain';
        } else {
            content = JSON.stringify(conv, null, 2);
            filename = conv.title.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
            type = 'application/json';
        }
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        document.getElementById('exportModal').style.display = 'none';
        this.showNotification('Exported: ' + filename);
    }

    initEmojiPicker() {
        const emojis = ['😀','😂','🤣','😊','😍','🤩','😎','🤔','😅','😆','😉','😌','😋','🤗','🤫','🤭','😐','😑','😶','😏','😒','🙄','😬','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','🤯','🥳','🤠','🤑','😈','👻','💀','☠️','👽','🤖','💩','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💯','💥','✨','🌟','⭐','🔥','💫','🎉','🎊','🎈','🎁','🏆','🥇','🎯','🚀','💡','📚','🔮','🧠','💻','⌨️','🖥️','📱','🔋','🔌','💎','🛡️','⚡','🌈','☀️','🌙','⭐','🌍','🌊','🍕','☕','🎵','🎶','📝','✏️','📌','🔗','✅','❌','⚠️','🔒','🔓','👍','👎','👏','🙌','🤝','✌️','🤞','👊','✊','🤲','👋','🙏','💪','🦾','🧩','🔧','⚙️','🔨'];
        const grid = document.getElementById('emojiGrid');
        emojis.forEach(emoji => {
            const item = document.createElement('span');
            item.className = 'emoji-item';
            item.textContent = emoji;
            item.addEventListener('click', () => {
                const input = document.getElementById('input');
                const start = input.selectionStart;
                const end = input.selectionEnd;
                input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
                input.focus();
                input.selectionStart = input.selectionEnd = start + emoji.length;
                input.dispatchEvent(new Event('input'));
                document.getElementById('emojiPicker').classList.remove('active');
            });
            grid.appendChild(item);
        });
    }

    toggleVoice() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showNotification('Voice input not supported');
            return;
        }
        const btn = document.getElementById('voiceBtn');
        if (btn.classList.contains('recording')) {
            this.recognition.stop();
            btn.classList.remove('recording');
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        let finalTranscript = '';
        this.recognition.onresult = (e) => {
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
                else interim += e.results[i][0].transcript;
            }
            const input = document.getElementById('input');
            input.value = finalTranscript + interim;
            input.dispatchEvent(new Event('input'));
        };
        this.recognition.onerror = () => { btn.classList.remove('recording'); };
        this.recognition.onend = () => { btn.classList.remove('recording'); };
        this.recognition.start();
        btn.classList.add('recording');
        this.showNotification('Listening...');
    }
}

document.addEventListener('DOMContentLoaded', () => new AIHub());

const style = document.createElement('style');
style.textContent = `
    @keyframes blink { 0%,80%,100% { opacity:0.5;transform:scale(0.8) } 40% { opacity:1;transform:scale(1.2) } }
    @keyframes messageIn { from { opacity:0;transform:translateY(20px) scale(0.95) } to { opacity:1;transform:translateY(0) scale(1) } }
    @keyframes ripple { to { transform:scale(4);opacity:0 } }
    @keyframes slideIn { from { transform:translateX(100%);opacity:0 } to { transform:translateX(0);opacity:1 } }
    @keyframes slideOut { from { transform:translateX(0);opacity:1 } to { transform:translateX(100%);opacity:0 } }
    .message { animation: messageIn 0.5s ease forwards; }
    #viewTitle { transition: opacity 0.3s; }
    ::selection { background: rgba(0,255,255,0.3); color: #fff; }
`;
document.head.appendChild(style);
