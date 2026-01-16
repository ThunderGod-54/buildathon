class Chatbot {
    constructor() {
        this.messagesContainer = document.getElementById('chatMessages');
        this.input = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.voiceButton = document.getElementById('voiceButton');
        this.context = [];
        this.isTyping = false;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;

        this.init();
    }

    init() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Add clear chat button
        this.clearChatButton = document.createElement('button');
        this.clearChatButton.textContent = 'Clear Chat';
        this.clearChatButton.style.background = 'none';
        this.clearChatButton.style.border = '1px solid black';
        this.clearChatButton.style.color = 'inherit';
        this.clearChatButton.style.cursor = 'pointer';
        this.clearChatButton.style.fontSize = '0.8em';
        this.clearChatButton.style.padding = '4px 8px';
        this.clearChatButton.style.borderRadius = '4px';
        this.clearChatButton.style.marginLeft = 'auto';
        this.clearChatButton.style.marginRight = '10px';
        this.clearChatButton.addEventListener('click', () => this.clearChat());
        // Position at the top of the chatbot, in the header
        const headerDiv = document.querySelector('#chatbot-container > div:first-child');
        if (headerDiv) {
            headerDiv.insertBefore(this.clearChatButton, headerDiv.lastElementChild);
        }

        // Update button color based on theme
        this.updateClearChatButtonColor();
        document.addEventListener('themeChanged', () => this.updateClearChatButtonColor());

        // Voice recording functionality
        if (this.voiceButton) {
            this.voiceButton.addEventListener('click', () => this.toggleVoiceRecording());
        }

        // Initialize speech recognition if available
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                // Update input with final transcript, append interim
                if (finalTranscript) {
                    this.input.value += finalTranscript;
                    // Hide loading animation when final transcript is received
                    this.hideVoiceLoading();
                }
                // For interim, could show in placeholder or something, but for now, just final
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg> Voice recognition failed. Please try again.', 'bot');
                this.hideVoiceLoading();
                this.stopVoiceRecording();
            };

            this.recognition.onend = () => {
                // Do not stop recording here, as it might end naturally
            };
        }

        // Add file upload functionality
        const addFileButton = document.getElementById('addFileButton');
        const fileUpload = document.getElementById('fileUpload');
        if (addFileButton && fileUpload) {
            addFileButton.addEventListener('click', () => {
                fileUpload.click();
            });

            fileUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleFileUpload(file);
                }
            });
        }
    }

    toggleVoiceRecording() {
        if (this.isRecording) {
            this.stopVoiceRecording();
        } else {
            this.startVoiceRecording();
        }
    }

    async startVoiceRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.updateVoiceButton(true);

            // Show loading animation
            this.showVoiceLoading();

            // Start speech recognition if available
            if (this.recognition) {
                this.recognition.start();
            }

            // Auto-stop after 30 seconds
            setTimeout(() => {
                if (this.isRecording) {
                    this.stopVoiceRecording();
                }
            }, 30000);

        } catch (error) {
            console.error('Error starting voice recording:', error);
            this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg> Could not access microphone. Please check permissions.', 'bot');
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.updateVoiceButton(false);
        }

        // Stop speech recognition if active
        if (this.recognition) {
            this.recognition.stop();
        }

        // Hide loading animation when recording stops
        this.hideVoiceLoading();
    }

    updateVoiceButton(isRecording) {
        if (isRecording) {
            this.voiceButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="2" width="6" height="12" rx="3"/>
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                <span style="color: #ff4444;">Recording...</span>
            `;
            this.voiceButton.style.background = 'linear-gradient(135deg, #ff4444, #ff6666)';
        } else {
            this.voiceButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
                Voice
            `;
            this.voiceButton.style.background = 'linear-gradient(135deg, var(--accent-orange), var(--accent-cyan))';
        }
    }

    async processVoiceMessage(audioBlob) {
        try {
            // Create audio URL for playback
            const audioUrl = URL.createObjectURL(audioBlob);

            // Add voice message to chat as tagged message
            this.addVoiceMessage(audioUrl, audioBlob);

            // Convert speech to text using Web Speech API if available
            if (this.recognition) {
                // Create a temporary audio element to play the recorded audio for recognition
                const audio = new Audio(audioUrl);
                audio.volume = 0; // Mute for recognition

                this.recognition.start();

                // Play the audio for recognition
                audio.play().catch(err => {
                    console.warn('Could not play audio for recognition:', err);
                    this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> Voice message recorded. Click play to listen.', 'bot');
                });
            } else {
                this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> Voice message recorded. Click play to listen.', 'bot');
            }

        } catch (error) {
            console.error('Error processing voice message:', error);
            this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg> Error processing voice message.', 'bot');
        }
    }

    addVoiceMessage(audioUrl, audioBlob) {
        const messageId = Date.now();
        const msg = document.createElement('div');
        msg.className = `chat-message voice`;
        msg.innerHTML = `
            <div class="message-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></div>
            <div class="message-bubble">
                <div class="voice-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg> Voice Message:</div>
                <audio id="audio-${messageId}" controls style="width: 100%; max-width: 250px; margin: 8px 0;">
                    <source src="${audioUrl}" type="audio/wav">
                    Your browser does not support audio playback.
                </audio>
                <div class="voice-prompt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Ask me anything about this voice message!</div>
            </div>
            <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
        `;
        this.messagesContainer.appendChild(msg);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Add to context for chatbot
        this.context.push(`Voice Message: [Audio file recorded at ${new Date().toLocaleString()}]`);

        // Auto-focus input for questions about the voice message
        setTimeout(() => {
            this.input.focus();
            this.input.placeholder = "Ask a question about the voice message...";
        }, 100);
    }

    addImageMessage(imageUrl, imageBlob) {
        const messageId = Date.now();
        const msg = document.createElement('div');
        msg.className = `chat-message image`;
        msg.innerHTML = `
            <div class="message-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></div>
            <div class="message-bubble">
                <div class="image-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Image Message:</div>
                <img id="image-${messageId}" src="${imageUrl}" style="width: 100%; max-width: 250px; margin: 8px 0; border-radius: 8px; object-fit: contain;">
                <div class="image-prompt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Ask me anything about this image!</div><div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
            </div>

        `;
        this.messagesContainer.appendChild(msg);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Convert blob to base64 and add to context
        this.fileToBase64(imageBlob).then(base64 => {
            this.context.push(`Image File: Marker Image\n\nBase64 Data: ${base64}`);
        }).catch(err => {
            console.error('Error converting image to base64:', err);
            this.context.push(`Image Message: [Image file uploaded at ${new Date().toLocaleString()}]`);
        });

        // Auto-focus input for questions about the image
        setTimeout(() => {
            this.input.focus();
            this.input.placeholder = "Ask a question about the image...";
        }, 100);
    }

    async sendMessage() {
        const message = this.input.value.trim();
        if (!message || this.isTyping) return;

        this.addMessage(message, 'user');
        this.input.value = '';
        this.showTypingIndicator();

        try {
            const res = await fetch('http://localhost:3000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    context: this.context
                })
            });

            const data = await res.json();
            this.hideTypingIndicator();
            this.addMessage(data.reply, 'bot');
        } catch (err) {
            this.hideTypingIndicator();
            this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg> Server not running or API error.', 'bot');
            console.error(err);
        }
    }

    structureBotMessage(text) {
        const lines = text.split('\n');
        let formatted = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && line.length < 50 && !line.includes('.') && !line.includes('?') && !line.includes('!')) {
                // Assume it's a title
                formatted += `**${line}**\n\n`;
            } else if (line) {
                formatted += `${line}\n\n`;
            }
        }
        return formatted;
    }

    addMessage(text, type) {
        const msg = document.createElement('div');
        msg.className = `chat-message ${type}`;
        let bubbleContent = text;
        if (type === 'bot') {
            text = this.structureBotMessage(text);
            if (typeof marked !== 'undefined') {
                bubbleContent = marked.parse(text);
            } else {
                // Fallback: replace **bold** with <strong>bold</strong> and \n\n with <br><br>
                bubbleContent = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br><br>');
            }
        }
        msg.innerHTML = `
            <div class="message-avatar">${type === 'user' ? 'U' : 'AI'}</div>
            <div class="message-bubble">${bubbleContent}</div>
            <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
        `;
        this.messagesContainer.appendChild(msg);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    showTypingIndicator() {
        this.isTyping = true;
        const el = document.createElement('div');
        el.id = 'typingIndicator';
        el.className = 'typing-indicator';
        el.innerHTML = `
            <div class="message-avatar">AI</div>
            <div class="typing-dots"><span></span><span></span><span></span></div>
        `;
        this.messagesContainer.appendChild(el);
    }

    hideTypingIndicator() {
        this.isTyping = false;
        document.getElementById('typingIndicator')?.remove();
    }

    showVoiceLoading() {
        const loadingElement = document.getElementById('voiceLoading');
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
    }

    hideVoiceLoading() {
        const loadingElement = document.getElementById('voiceLoading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    addContext(content) {
        this.context.push(content);
    }

    clearChat() {
        this.messagesContainer.innerHTML = '';
        this.context = [];
    }

    addSnippedText(text) {
        // Add the snipped text as a user message to the chat
        this.addMessage(text, 'user');

        // Create a tagged message for snipped text
        const taggedMessage = {
            type: 'snipped',
            content: text,
            timestamp: new Date().toLocaleTimeString()
        };

        // Add to context
        this.context.push(`Snipped Text: "${text}"`);

        // Display the tagged message
        this.addTaggedMessage(taggedMessage);

        // Auto-focus the input for user to ask questions
        setTimeout(() => {
            this.input.focus();
            this.input.placeholder = "Ask a question about the snipped text...";
        }, 100);
    }

    addTaggedMessage(message) {
        const msg = document.createElement('div');
        msg.className = `chat-message snipped`;
        msg.innerHTML = `
            <div class="message-avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg></div>
            <div class="message-bubble">
                <div class="snipped-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg> Snipped Text:</div>
                <div class="snipped-content">"${message.content}"</div>
                <div class="snipped-prompt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Ask me anything about this text!</div>
            </div>
            <div class="message-timestamp">${message.timestamp}</div>
        `;
        this.messagesContainer.appendChild(msg);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async handleFileUpload(file) {
        try {
            let fileContent = '';

            if (file.type === 'application/pdf') {
                // For PDF files, we'll extract text using PDF.js if available
                if (typeof pdfjsLib !== 'undefined') {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let text = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        text += textContent.items.map(item => item.str).join(' ') + '\n';
                    }

                    fileContent = `PDF File: ${file.name}\n\nExtracted Text:\n${text}`;
                } else {
                    // Fallback: convert to base64
                    const base64 = await this.fileToBase64(file);
                    fileContent = `PDF File: ${file.name}\n\nBase64 Data: ${base64}`;
                }
            } else if (file.type.startsWith('image/')) {
                // For images, convert to base64
                const base64 = await this.fileToBase64(file);
                fileContent = `Image File: ${file.name}\n\nBase64 Data: ${base64}`;
            } else {
                // Fallback for other file types
                const text = await file.text();
                fileContent = `File: ${file.name}\n\n${text}`;
            }

            this.addContext(fileContent);
            this.addMessage(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg> File "${file.name}" added to context (${file.size} bytes)`, 'user');
        } catch (error) {
            console.error('Error reading file:', error);
            this.addMessage('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 1em; height: 1em; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg> Error reading file', 'bot');
        }
    }

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    updateClearChatButtonColor() {
        if (this.clearChatButton) {
            const body = document.body;
            if (body.classList.contains('dark-theme')) {
                this.clearChatButton.style.border = '1px solid white';
                this.clearChatButton.style.color = 'white';
            } else {
                this.clearChatButton.style.border = '1px solid black';
                this.clearChatButton.style.color = 'black';
            }
        }
    }

    updateClearChatButtonVisibility() {
        if (this.clearChatButton) {
            // Always visible in both themes
            this.clearChatButton.style.display = 'inline-block';
        }
    }

    sendDefaultMessage(message) {
        this.sendMessage(message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.chatbotInstance = new Chatbot();
});