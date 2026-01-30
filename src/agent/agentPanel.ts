/**
 * Agent Panel Manager
 * Handles chat UI, agent queries, and AI interactions
 */

export function initializeAgentPanel(): void {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const chatSend = document.getElementById('chat-send') as HTMLButtonElement;

    if (chatSend) {
        chatSend.addEventListener('click', () => {
            handleChatSubmit();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleChatSubmit();
            }
        });
    }
}

export function addChatMessage(text: string, type: 'user' | 'agent', isTyping: boolean = false): HTMLElement | null {
    const chatHistoryList = document.getElementById('chat-history-list') as HTMLElement;
    if (!chatHistoryList) return null;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message chat-message-${type}`;
    if (isTyping) messageDiv.classList.add('typing');

    const textDiv = document.createElement('div');
    textDiv.className = 'chat-message-text';
    textDiv.textContent = text;

    messageDiv.appendChild(textDiv);
    chatHistoryList.appendChild(messageDiv);

    // Auto-scroll to latest message
    chatHistoryList.scrollTop = chatHistoryList.scrollHeight;

    return messageDiv;
}

export function updateChatMessage(element: HTMLElement, text: string): void {
    const textDiv = element.querySelector('.chat-message-text');
    if (textDiv) {
        textDiv.textContent = text;
    }
    element.classList.remove('typing');
}

export function clearChatHistory(): void {
    const chatHistoryList = document.getElementById('chat-history-list') as HTMLElement;
    if (chatHistoryList) {
        chatHistoryList.innerHTML = '';
    }
}

export function getChatInput(): string {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    return chatInput ? chatInput.value.trim() : '';
}

export function setChatInput(text: string): void {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    if (chatInput) {
        chatInput.value = text;
    }
}

export function clearChatInput(): void {
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    if (chatInput) {
        chatInput.value = '';
    }
}

export function showChatLoading(): void {
    const chatSend = document.getElementById('chat-send') as HTMLButtonElement;
    if (chatSend) {
        chatSend.disabled = true;
        chatSend.classList.add('loading');
    }
}

export function hideChatLoading(): void {
    const chatSend = document.getElementById('chat-send') as HTMLButtonElement;
    if (chatSend) {
        chatSend.disabled = false;
        chatSend.classList.remove('loading');
    }
}

function handleChatSubmit(): void {
    const input = getChatInput();
    if (!input) return;

    // Add user message
    addChatMessage(input, 'user');
    clearChatInput();

    // Trigger custom event for main data handler
    const event = new CustomEvent('chatQuery', { detail: { query: input } });
    document.dispatchEvent(event);
}

export function initializeChatHistory(): void {
    const clearHistoryBtn = document.getElementById('chat-history-clear');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Clear all chat history?')) {
                clearChatHistory();
            }
        });
    }
}
