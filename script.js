/**
     * Logic for Story Generation and TTS
     */
    const wordDisplay = document.getElementById('word-display');
    const topicInput = document.getElementById('topic-input');
    const generateBtn = document.getElementById('generate-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const miniPlayBtn = document.getElementById('mini-play-btn'); 
    const stopBtn = document.getElementById('stop-btn');
    const seekBar = document.getElementById('seek-bar');
    const loader = document.getElementById('loader');
    const toggleUiBtn = document.getElementById('toggle-ui');
    const controls = document.getElementById('controls');
    const seekWrapper = document.getElementById('seek-wrapper');
    const voiceSelect = document.getElementById('voice-select');
    const speedRange = document.getElementById('speed-range');
    const speedLabel = document.getElementById('speed-label');

    let currentStoryText = "";
    const synthesis = window.speechSynthesis;
    window.currentUtterance = null; 
    let currentOffset = 0; 
    let voices = [];

    // Initialize Voices
    function populateVoiceList() {
        // Wait for voices to be available
        voices = synthesis.getVoices().sort((a, b) => {
            const aname = a.name.toUpperCase();
            const bname = b.name.toUpperCase();
            // Prioritize Local Voices
            if (a.localService && !b.localService) return -1;
            if (!a.localService && b.localService) return 1;
            if (aname < bname) return -1;
            if (aname > bname) return 1;
            return 0;
        });

        // Filter for English primarily
        const englishVoices = voices.filter(voice => voice.lang.includes('en'));
        const displayVoices = englishVoices.length > 0 ? englishVoices : voices;

        voiceSelect.innerHTML = '';
        displayVoices.forEach((voice) => {
            const option = document.createElement('option');
            const localLabel = voice.localService ? " (Local - Best Sync)" : " (Network)";
            option.textContent = `${voice.name}${localLabel}`;
            option.value = voice.name;
            
            // Auto-select priority: Local English -> Google US English -> First available
            if (voice.localService && voice.lang.includes("en-US")) {
                 if (!voiceSelect.value) option.selected = true; // Select first good match
            }
            
            voiceSelect.appendChild(option);
        });

        // Fallback selection if no good local voice found
        if (!voiceSelect.value && displayVoices.length > 0) {
            voiceSelect.selectedIndex = 0;
        }
    }

    // Chrome often loads voices asynchronously
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
    // Also try immediately
    setTimeout(populateVoiceList, 100);

    // Speed Control Handler
    speedRange.addEventListener('input', (e) => {
        speedLabel.textContent = e.target.value + 'x';
    });
    
    // When speed or voice changes during playback, restart from current spot
    const updatePlaybackSettings = () => {
        if (!synthesis.paused && !synthesis.speaking) return; // Not playing
        // If playing or paused, restart to apply settings
        speakStory(currentOffset);
    };

    speedRange.addEventListener('change', updatePlaybackSettings); // On drag release
    voiceSelect.addEventListener('change', updatePlaybackSettings);


    // Toggle UI (Only toggles the main box, keeps seek bar)
    toggleUiBtn.addEventListener('click', () => {
        controls.classList.toggle('hidden-ui');
        toggleUiBtn.textContent = controls.classList.contains('hidden-ui') ? 'Show UI' : 'Hide UI';
    });

    // Global Tap to Play/Pause (When UI is hidden)
    document.body.addEventListener('click', (e) => {
        // Condition: Main UI is hidden
        if (controls.classList.contains('hidden-ui')) {
            // Check if click target is NOT an interactive element (buttons, seek bar, etc)
            const isInteractive = e.target.closest('button') || 
                                  e.target.closest('input') || 
                                  e.target.closest('#seek-wrapper');
            
            if (!isInteractive) {
                togglePlayPauseLogic();
                showTemporaryVisualFeedback();
            }
        }
    });

    // Generate Story
    generateBtn.addEventListener('click', async () => {
        const topic = topicInput.value.trim() || "A generic dramatic confession";
        
        handleStop();
        
        loader.style.display = 'block';
        generateBtn.disabled = true;
        wordDisplay.textContent = "GENERATING...";
        
        try {
            const apiKey = config.MY_API_KEY; // Set by environment
            
            const prompt = `Write a short, engaging, first-person Reddit-style story (like r/confessions, r/AITA, or r/TIFU). 
            Topic: ${topic}.
            Rules:
            1. Keep it under 150 words.
            2. Make it sound conversational and dramatic.
            3. Do not include a title or "TLDR".
            4. Start directly with the story.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();
            
            if (data.error) throw new Error(data.error.message);
            
            currentStoryText = data.candidates[0].content.parts[0].text;
            currentStoryText = currentStoryText.replace(/\*/g, '');

            wordDisplay.textContent = "PRESS PLAY";
            
            // Enable all controls
            playPauseBtn.disabled = false;
            miniPlayBtn.disabled = false;
            stopBtn.disabled = false;
            seekBar.disabled = false;
            seekBar.value = 0;
            
        } catch (err) {
            console.error(err);
            wordDisplay.textContent = "ERROR";
            setTimeout(() => wordDisplay.textContent = "TRY AGAIN", 2000);
        } finally {
            loader.style.display = 'none';
            generateBtn.disabled = false;
        }
    });

    // Play/Pause Handlers
    playPauseBtn.addEventListener('click', togglePlayPauseLogic);
    miniPlayBtn.addEventListener('click', togglePlayPauseLogic); // Mini button handler

    function togglePlayPauseLogic() {
        if (!currentStoryText) return;

        if (synthesis.paused) {
            synthesis.resume();
            updatePlayButtonState('playing');
        } else if (synthesis.speaking) {
            synthesis.pause();
            updatePlayButtonState('paused');
        } else {
            speakStory(currentOffset || 0);
        }
    }

    // Stop Button
    stopBtn.addEventListener('click', handleStop);

    // Seek Bar Handler
    seekBar.addEventListener('input', (e) => {
        if (!currentStoryText) return;
        const percent = parseInt(e.target.value);
        const charIndex = Math.floor((percent / 100) * currentStoryText.length);
        speakStory(charIndex);
    });

    function handleStop() {
        synthesis.cancel();
        updatePlayButtonState('stopped');
        currentOffset = 0;
        seekBar.value = 0;
        if (currentStoryText) wordDisplay.textContent = "PRESS PLAY";
        else wordDisplay.textContent = "READY";
    }

    function updatePlayButtonState(state) {
        // Main Button Updates
        if (state === 'playing') {
            playPauseBtn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause';
            playPauseBtn.classList.remove('bg-green-600', 'bg-gray-700');
            playPauseBtn.classList.add('bg-amber-600');
            
            // Mini Button Icon
            miniPlayBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else if (state === 'paused') {
            playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Resume';
            playPauseBtn.classList.remove('bg-amber-600', 'bg-gray-700');
            playPauseBtn.classList.add('bg-green-600');

            miniPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            playPauseBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Play';
            playPauseBtn.classList.remove('bg-green-600', 'bg-amber-600');
            playPauseBtn.classList.add('bg-gray-700');

            miniPlayBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    // Temporary Visual Feedback for Tap (Subtle flash)
    function showTemporaryVisualFeedback() {
        // Just a subtle flash on word display to acknowledge tap
        wordDisplay.style.opacity = '0.5';
        setTimeout(() => wordDisplay.style.opacity = '1', 100);
    }

    function speakStory(startIndex = 0) {
        if (window.currentUtterance) {
            window.currentUtterance.onend = null;
        }
        synthesis.cancel();

        currentOffset = startIndex;

        if (startIndex >= currentStoryText.length) {
            handleStop();
            return;
        }

        setTimeout(() => {
            if (!currentStoryText) return;

            const textToSpeak = currentStoryText.slice(startIndex);
            window.currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
            const u = window.currentUtterance;
            
            // Voice Selection Logic
            const selectedVoiceName = voiceSelect.value;
            const selectedSpeed = parseFloat(speedRange.value);
            
            // Try to find the user's selected voice
            let preferredVoice = voices.find(v => v.name === selectedVoiceName);
            
            // Intelligent Fallback: Prefer LOCAL voices if the selected one is missing or invalid
            if (!preferredVoice) preferredVoice = voices.find(v => v.lang.includes("en") && v.localService);
            if (!preferredVoice) preferredVoice = voices.find(v => v.name.includes("Google US English"));
            
            if (preferredVoice) u.voice = preferredVoice;
            
            // Apply Speed
            u.rate = selectedSpeed;
            u.pitch = 1.0;

            u.onboundary = (event) => {
                if (event.name === 'word') {
                    const trueIndex = currentOffset + event.charIndex;
                    
                    // Update Seek Bar 
                    const progress = (trueIndex / currentStoryText.length) * 100;
                    seekBar.value = progress;

                    const textRem = textToSpeak.slice(event.charIndex);
                    // Improved Regex to grab word including punctuation attached to it (more natural reading)
                    // but display just the word for cleaner look if desired.
                    const match = textRem.match(/\S+/); 
                    if (match) {
                        updateDisplay(match[0]);
                    }
                }
            };

            u.onstart = () => updatePlayButtonState('playing');

            u.onend = () => {
                if (seekBar.value > 98) {
                    wordDisplay.classList.remove('pop');
                    wordDisplay.textContent = "THE END";
                    updatePlayButtonState('stopped');
                    seekBar.value = 100;
                }
            };
            
            u.onerror = (e) => {
                if (e.error !== 'canceled' && e.error !== 'interrupted') {
                    console.error("Speech Error Details:", e.error, e);
                    updatePlayButtonState('stopped');
                }
            }

            synthesis.speak(u);
            
            if (synthesis.paused) synthesis.resume();

        }, 50);
    }

    function updateDisplay(word) {
        if(!word) return;
        wordDisplay.textContent = word;
        wordDisplay.classList.remove('pop');
        void wordDisplay.offsetWidth;
        wordDisplay.classList.add('pop');
    }
