document.addEventListener('DOMContentLoaded', () => {
    console.log("Wellm Dashboard Script Loaded - With Manual Image Upload");

    // ================= CONFIGURATION =================
    const CONFIG = {
        URLS: {
            CREATE: 'https://lavish026.app.n8n.cloud/webhook/333ce980-cad1-4c54-8017-334739372f77', 
            GET_PENDING: 'https://lavish026.app.n8n.cloud/webhook/c98532ef-8a73-4e10-8961-fe901470510c',
            APPROVE: 'https://lavish026.app.n8n.cloud/webhook/024b69fd-35f5-4cef-a8a6-a263a3fe303a',
            REGENERATE: 'https://lavish026.app.n8n.cloud/webhook/53cdf3cb-1233-467c-8396-c0344286ec09',
            DELETE: 'https://lavish026.app.n8n.cloud/webhook/bf2f7872-4902-4bce-994d-1dbf247ff193',
            GET_STATUS: 'https://lavish026.app.n8n.cloud/webhook/8b49c8ca-7b63-4492-84e7-4b6278454cda',
            UPLOAD_IMAGE: 'https://lavish026.app.n8n.cloud/webhook/7531fd31-8ed7-4fae-8e23-e6928fd8990c' // ← ADD YOUR NEW WEBHOOK URL HERE
        }
    };

    // ================= STATE VARIABLES =================
    let persona_id = localStorage.getItem('persona_id');
    let secret_key = localStorage.getItem('secret_key');
    let livePosts = [];
    let currentPostId = null;
    let statusCheckerInterval = null;
    let isGenerationInProgress = false;
    let persistentGenerationToast = null;

    // ================= DOM ELEMENTS =================
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const reviewTableBody = document.getElementById('reviewTableBody');
    const toastContainer = document.getElementById('toastContainer');
    
    const statusBanner = document.getElementById('statusBanner');
    const bannerMessage = document.getElementById('bannerMessage');
    const btnSpinner = document.getElementById('btn-spinner');
    const btnText = document.getElementById('btn-text');

    const topicInput = document.getElementById('topic-input');
    const submitBtn = document.getElementById('create-post-btn');
    const chooseFileBtn = document.getElementById('chooseFileBtn');
    const fileInput = document.getElementById('file-input');
    const fileDisplayArea = document.getElementById('file-display-area');

    const modal = document.getElementById('reviewModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalContextDetails = document.getElementById('modalContextDetails');
    const modalContentContainer = document.getElementById('modalContentContainer');
    const approveBtn = document.getElementById('approveBtn');

    // ================= AUTH CHECK =================
    if (!persona_id || !secret_key) {
        console.warn("Credentials missing. Redirecting to login.");
    }

    const personaNameElement = document.getElementById('personaName');
    if (personaNameElement && persona_id) {
        let displayName = persona_id.toLowerCase() === 'lifepersona' ? 'Lifeline' : persona_id;
        personaNameElement.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }

    // ================= HELPER FUNCTIONS =================
    
    const setPersistentStatus = (message, isVisible, isError = false) => {
        if (!statusBanner) return;
        bannerMessage.textContent = message;
        statusBanner.style.display = isVisible ? 'flex' : 'none'; 
        
        if (isError) {
            statusBanner.style.backgroundColor = '#d32f2f';
            statusBanner.style.color = 'white';
        } else if (isVisible) {
            statusBanner.style.backgroundColor = '#ffaa33';
            statusBanner.style.color = '#333';
        }
    };
    
    const setCreateButtonState = (isLoading) => {
        submitBtn.disabled = isLoading;
        if (isLoading) {
            btnText.textContent = 'Generating...';
            if (btnSpinner) btnSpinner.style.display = 'inline-block'; 
        } else {
            btnText.textContent = 'Generate Content';
            if (btnSpinner) btnSpinner.style.display = 'none';
        }
    };

    const showToast = (message, type = 'info', isPersistent = false) => {
        if (!toastContainer) return;

        if (isPersistent) {
            if (persistentGenerationToast) {
                persistentGenerationToast.remove();
            }
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            const icon = 'fa-hourglass-start';
            toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
            toastContainer.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            persistentGenerationToast = toast;
            return toast;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, type === 'error' ? 6000 : 3000);
        
        return toast;
    };

    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });

    // ================= STATUS POLLING FUNCTION =================
    const startStatusPolling = (jobId) => {
        let pollCount = 0;
        const maxPolls = 5;
        
        statusCheckerInterval = setInterval(async () => {
            pollCount++;
            
            try {
                const response = await fetch(`${CONFIG.URLS.GET_STATUS}?job_id=${encodeURIComponent(jobId)}&persona_id=${encodeURIComponent(persona_id)}`);
                
                if (!response.ok) throw new Error('Status check failed');
                
                const data = await response.json();
                console.log("Status response:", data);
                
                if (data.status === 'generated' || data.status === 'success') {
                    clearInterval(statusCheckerInterval);
                    statusCheckerInterval = null;
                    isGenerationInProgress = false;
                    
                    if (persistentGenerationToast) {
                        persistentGenerationToast.classList.remove('show');
                        setTimeout(() => {
                            if (persistentGenerationToast) persistentGenerationToast.remove();
                            persistentGenerationToast = null;
                        }, 500);
                    }
                    
                    setPersistentStatus('Your content is ready to review!', true, false);
                    setCreateButtonState(false);
                    showToast('Content generated successfully!', 'success', false);
                    
                    topicInput.value = '';
                    fileDisplayArea.innerHTML = '';
                    fileInput.value = null;
                    
                    setTimeout(() => {
                        setPersistentStatus('', false);
                        const reviewLink = document.querySelector('[data-page="review"]');
                        if (reviewLink) reviewLink.click();
                    }, 2000);
                    
                } else if (data.status === 'error') {
                    clearInterval(statusCheckerInterval);
                    statusCheckerInterval = null;
                    isGenerationInProgress = false;
                    throw new Error(data.message || 'Workflow encountered an error. Please try again.');
                    
                } else if (pollCount >= maxPolls) {
                    clearInterval(statusCheckerInterval);
                    statusCheckerInterval = null;
                    isGenerationInProgress = false;
                    throw new Error('Generation timeout after 7.5 minutes. Please check Review Pipeline for results.');
                }
                
            } catch (error) {
                clearInterval(statusCheckerInterval);
                statusCheckerInterval = null;
                isGenerationInProgress = false;
                
                if (persistentGenerationToast) {
                    persistentGenerationToast.classList.remove('show');
                    setTimeout(() => {
                        if (persistentGenerationToast) persistentGenerationToast.remove();
                        persistentGenerationToast = null;
                    }, 500);
                }
                
                setPersistentStatus('Error: ' + error.message, true, true);
                showToast(error.message, 'error');
                setCreateButtonState(false);
            }
        }, 90000);
    };

    // ================= CREATE POST LOGIC =================

    function setupFormSubmit() {
        if (chooseFileBtn) chooseFileBtn.addEventListener('click', () => fileInput.click());
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                const file = fileInput.files[0];
                if (file) {
                    if (file.size > 10 * 1024 * 1024) {
                        showToast('File too large (Max 10MB)', 'error');
                        fileInput.value = null;
                        return;
                    }
                    fileDisplayArea.innerHTML = `<div class="file-preview-item"><div class="file-preview-info">${file.name}</div></div>`;
                }
            });
        }
        if (submitBtn) submitBtn.addEventListener('click', handleCreatePost);
    }

    const handleCreatePost = async (e) => {
        e.preventDefault();
        const prompt_text = topicInput.value.trim();
        const file = fileInput.files[0];
        if (!prompt_text) return showToast('Please enter a topic.', 'error');

        setCreateButtonState(true);
        isGenerationInProgress = true;
        setPersistentStatus('Content is generating', true);

        try {
            let fileData = {};
            if (file) {
                fileData = {
                    reference_file_name: file.name,
                    reference_file_mimetype: file.type,
                    reference_file_base64: await toBase64(file)
                };
            }

            const response = await fetch(CONFIG.URLS.CREATE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt_text,
                    source: "ui",
                    "Persona-ID": persona_id,
                    "Secret-Key": secret_key,
                    ...fileData
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${errorText.substring(0, 100)}`);
            }
            
            const data = await response.json();
            console.log("Create response:", data);
            
            if (data.status === 'processing' && data.jobId) {
                startStatusPolling(data.jobId);
            } else {
                throw new Error('Invalid initial response from server.');
            }

        } catch (error) {
            isGenerationInProgress = false;
            
            if (persistentGenerationToast) {
                persistentGenerationToast.classList.remove('show');
                setTimeout(() => {
                    if (persistentGenerationToast) persistentGenerationToast.remove();
                    persistentGenerationToast = null;
                }, 500);
            }
            
            console.error("Error:", error);
            setPersistentStatus('Error: ' + error.message, true, true);
            showToast(error.message, 'error');
            setCreateButtonState(false);
        }
    };

    // ================= REVIEW TABLE LOGIC =================

    const fetchAndRenderReviewTable = async () => {
        if (!reviewTableBody) return;
        reviewTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

        try {
            const response = await fetch(`${CONFIG.URLS.GET_PENDING}?persona_id=${persona_id}`);
            if (!response.ok) throw new Error('Failed to fetch posts');
            const data = await response.json();
            
            livePosts = data.map(item => {
                let content = item.generated_content || item.genrated_content || item.output || {};
                if (typeof content === 'string') {
                    try { content = JSON.parse(content); } catch(e) { content = {}; }
                }
                
                if (content.output && typeof content.output === 'object') {
                    content = content.output;
                }
                
                let finalContent = content.platform_posts && typeof content.platform_posts === 'object' ? content.platform_posts : content;

                const updatePlatform = (platformName, text, image) => {
                    let key = Object.keys(finalContent).find(k => k.toLowerCase() === platformName.toLowerCase());
                    if (!key) {
                        key = platformName;
                        finalContent[key] = {};
                    }
                    if (text) finalContent[key].post_text = text;
                    if (image) finalContent[key].image_suggestion = image;
                };

                updatePlatform('linkedin', item.linkedin_post_text, item.linkedin_image || item.linkedin_image_url);
                updatePlatform('instagram', item.instagram_post_text, item.instagram_image || item.instagram_image_url);
                updatePlatform('facebook', item.facebook_post_text, item.facebook_image || item.facebook_image_url);
                updatePlatform('twitter', item.twitter_post_text, item.twitter_image || item.twitter_image_url);
                updatePlatform('youtube_shorts', item.youtube_post_text, item.youtube_image || item.youtube_image_url);

                return { ...item, content: finalContent, id: item.post_id };
            });

            renderReviewTable(livePosts);

        } catch (error) {
            console.error(error);
            reviewTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Error: ${error.message}</td></tr>`;
        }
    };
    
    const renderReviewTable = (posts) => {
        reviewTableBody.innerHTML = '';
        const pendingPosts = posts.filter(p => p.status === 'pending-approval' || p.status === 'regenerating');
        if (pendingPosts.length === 0) {
            reviewTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No pending reviews.</td></tr>';
            return;
        }

        pendingPosts.forEach(post => {
            const tr = document.createElement('tr');
            let preview = "No preview available";
            const platforms = Object.keys(post.content || {});
            const validPlat = platforms.find(k => typeof post.content[k] === 'object' && post.content[k] !== null);
            
            if (validPlat) {
                const pData = post.content[validPlat];
                preview = (pData.post_text || pData.post || pData.caption || pData.description || pData.script || "").toString().substring(0, 80) + "...";
            }

            const statusClass = post.status === 'regenerating' ? 'status-regenerating' : 'status-pending';
            const postId = post.id || post.post_id;
            
            tr.innerHTML = `
                <td>${post.topic || post.prompt_text || "No Topic"}</td>
                <td>${preview}</td>
                <td><span class="status-badge ${statusClass}">${post.status}</span></td>
                <td><span class="source-tag ${post.source || 'manual'}">${post.source || 'manual'}</span></td>
                <td class="actions-cell">
                    <button class="action-btn review-btn" onclick="window.triggerOpenModal('${postId}')">Review</button>
                    <button class="action-btn delete-btn" onclick="window.triggerDelete('${postId}', this)"><i class="fas fa-trash"></i></button>
                </td>
            `;
            reviewTableBody.appendChild(tr);
        });
    };
    
    // ================= MODAL & REGENERATION LOGIC =================
    window.triggerOpenModal = (postId) => openModal(postId);

    const openModal = (postId) => {
        currentPostId = postId;
        const post = livePosts.find(p => p.id === postId || p.post_id === postId);
        if (!post) return showToast("Post not found", 'error');

        modalContextDetails.innerHTML = `
            <div class="context-item">
                <strong><i class="fas fa-user-edit"></i> Topic / Instructions:</strong>
                <div class="context-prompt">${post.topic || post.prompt_text}</div>
            </div>
        `;

        modalContentContainer.innerHTML = '';
        const content = post.content || {};

        Object.keys(content).forEach(platform => {
            if (['name', 'description', 'error', 'raw', 'topic', 'additional_notes', 'output'].includes(platform.toLowerCase())) return;
            
            const data = content[platform];
            if (typeof data !== 'object' || data === null) return;

            const block = document.createElement('div');
            block.className = 'platform-block';

            block.innerHTML = `
                <h3 style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" 
                                class="platform-selector" 
                                data-platform="${platform}" 
                                onchange="window.togglePlatform('${platform}', this.checked)"
                                style="transform: scale(1.3); cursor: pointer;">
                        
                        <span><i class="fab fa-${getIcon(platform)}"></i> ${platform}</span>
                    </div>
                    <button class="action-btn regenerate-btn" onclick="window.triggerRegenerate('${platform}', 'all')">
                        <i class="fas fa-sync"></i> Regen All Post
                    </button>
                </h3>
            `;

            const imageSuggestion = data.image_suggestion || "";
            const imageSection = document.createElement('div');
            imageSection.className = 'content-field';
            imageSection.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <input type="checkbox" 
                            class="field-selector" 
                            id="chk-${platform}-image"
                            data-platform="${platform}" 
                            data-field-type="image_suggestion" 
                            style="transform: scale(1.3); cursor: pointer;">
                    <label for="chk-${platform}-image"><strong>IMAGE / THUMBNAIL</strong></label>
                </div>
                <div id="image-preview-${platform}" style="margin-bottom:10px; border:1px solid #eee; padding:5px; border-radius:5px;">
                    ${imageSuggestion ? `
                        <img src="${imageSuggestion}" id="img-${platform}" style="max-width:100%; max-height:200px; display:block;" onerror="this.style.display='none'">
                        <a href="${imageSuggestion}" target="_blank" style="font-size:0.8em; color:#FF6F00; display:block; margin-top:5px;">View Full Image</a>
                    ` : `<div id="img-${platform}" style="color:#888; font-size:0.9em;">No image available.</div>`}
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                    <input type="file" id="upload-${platform}-image" accept="image/*" style="display:none;">
                    <button class="action-btn" style="background-color: #4CAF50;" onclick="document.getElementById('upload-${platform}-image').click()">
                        <i class="fas fa-upload"></i> Upload Image
                    </button>
                    <button class="action-btn regenerate-btn" id="btn-${platform}-image_suggestion" onclick="window.triggerRegenerate('${platform}', 'image_suggestion')">
                        <i class="fas fa-image"></i> Regen Image
                    </button>
                </div>
            `;
            block.appendChild(imageSection);

            // Setup file upload handler for this platform
            setTimeout(() => {
                const uploadInput = document.getElementById(`upload-${platform}-image`);
                if (uploadInput) {
                    uploadInput.addEventListener('change', (e) => handleManualImageUpload(platform, e.target));
                }
            }, 100);

            const postTextContent = [];
            if (data.post_text) {
                postTextContent.push(data.post_text);
            } else {
                if (data.title) postTextContent.push(data.title);
                if (data.post) postTextContent.push(data.post);
                else if (data.caption) postTextContent.push(data.caption);
                else if (data.description) postTextContent.push(data.description);
                if (data.script) postTextContent.push(Array.isArray(data.script) ? data.script.join('\n') : data.script);
                if (data.video_script) postTextContent.push(Array.isArray(data.video_script) ? data.video_script.join('\n') : data.video_script);
                if (data.shorts_script) postTextContent.push(Array.isArray(data.shorts_script) ? data.shorts_script.join('\n') : data.shorts_script);
                if (Array.isArray(data.hashtags) && data.hashtags.length > 0) postTextContent.push(data.hashtags.join(' '));
                if (data.call_to_action) postTextContent.push(data.call_to_action);
                if (data.cta) postTextContent.push(data.cta);
            }
            
            const mergedPostText = postTextContent.filter(Boolean).join('\n\n').trim();

            const postTextSection = document.createElement('div');
            postTextSection.className = 'content-field';
            postTextSection.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <input type="checkbox" 
                            class="field-selector" 
                            id="chk-${platform}-text"
                            data-platform="${platform}" 
                            data-field-type="post_text" 
                            style="transform: scale(1.3); cursor: pointer;">
                    <label for="chk-${platform}-text"><strong>POST CONTENT / SCRIPT</strong></label>
                </div>
                <textarea id="input-${platform}-post_text" 
                            data-platform="${platform}" 
                            data-field="post_text" 
                            rows="${mergedPostText.length > 300 ? 15 : 8}">${mergedPostText}</textarea>
                <button class="action-btn regenerate-btn" style="margin-top:5px;" id="btn-${platform}-post_text" onclick="window.triggerRegenerate('${platform}', 'post_text')">
                    <i class="fas fa-paragraph"></i> Regen Content
                </button>
            `;
            block.appendChild(postTextSection);

            modalContentContainer.appendChild(block);
        });

        modal.style.display = 'flex';
    };

    // ================= MANUAL IMAGE UPLOAD HANDLER =================
    const handleManualImageUpload = async (platform, input) => {
        const file = input.files[0];
        if (!file) return;

        // Validate file
        if (!file.type.startsWith('image/')) {
            showToast('Please upload an image file', 'error');
            input.value = '';
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('Image too large (Max 5MB)', 'error');
            input.value = '';
            return;
        }

        try {
            showToast('Uploading image...', 'info');
            
            // Convert to base64
            const base64 = await toBase64(file);
            
            // Upload to backend
            const response = await fetch(CONFIG.URLS.UPLOAD_IMAGE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    post_id: currentPostId,
                    platform: platform,
                    image_base64: base64,
                    filename: file.name,
                    mimetype: file.type,
                    'Persona-ID': persona_id
                })
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            console.log('Upload response:', data);

            if (!data.success) throw new Error(data.message || 'Upload failed');

            // Update UI with uploaded image
            const previewContainer = document.getElementById(`image-preview-${platform}`);
            if (previewContainer) {
                previewContainer.innerHTML = `
                    <img src="${data.image_url}" id="img-${platform}" style="max-width:100%; max-height:200px; display:block;">
                    <a href="${data.image_url}" target="_blank" style="font-size:0.8em; color:#FF6F00; display:block; margin-top:5px;">View Full Image</a>
                    <p style="font-size:0.8em; color:#4CAF50; margin-top:5px;">✓ Uploaded: ${file.name}</p>
                `;
            }

            // Update local post data
            const post = livePosts.find(p => p.id === currentPostId || p.post_id === currentPostId);
            if (post && post.content && post.content[platform]) {
                post.content[platform].image_suggestion = data.image_url;
                post.content[platform].manual_upload = true;
            }

            showToast(`Image uploaded successfully for ${platform}!`, 'success');
            
            // Clear file input
            input.value = '';
            
        } catch (error) {
            console.error('Upload error:', error);
            showToast('Failed to upload image: ' + error.message, 'error');
            input.value = '';
        }
    };

    window.togglePlatform = (platform, isChecked) => {
        const childCheckboxes = document.querySelectorAll(`.field-selector[data-platform="${platform}"]`);
        childCheckboxes.forEach(box => box.checked = isChecked);
    };

    function getIcon(platform) {
        const p = platform.toLowerCase();
        if (p.includes('linkedin')) return 'linkedin';
        if (p.includes('instagram')) return 'instagram';
        if (p.includes('twitter')) return 'twitter';
        if (p.includes('facebook')) return 'facebook';
        if (p.includes('youtube')) return 'youtube';
        return 'share-alt';
    }

    window.triggerRegenerate = async (platform, type) => {
        const post = livePosts.find(p => p.id === currentPostId || p.post_id === currentPostId);
        if (!post) return showToast("Post not found", 'error');

        let promptMsg = "";
        if (type === 'all') promptMsg = `Instructions to regenerate WHOLE ${platform} post?\n(AI will see your current content and improve based on your feedback)`;
        else if (type === 'image_suggestion') promptMsg = `What changes do you want in the ${platform} IMAGE?\n(e.g., "make it brighter", "add more people", "change background")`;
        else if (type === 'post_text') promptMsg = `What changes do you want in the ${platform} TEXT?\n(e.g., "make it shorter", "more professional tone", "add emojis")`;
        else promptMsg = `Instructions for ${platform}?`;

        const feedback = prompt(promptMsg);
        if (feedback === null) return;

        // Get current content for context
        const currentContent = post.content[platform] || {};
        const currentImage = currentContent.image_suggestion || "";
        const currentText = currentContent.post_text || currentContent.post || currentContent.caption || "";

        sendRegenRequest(platform, type, feedback, {
            current_image_url: currentImage,
            current_post_text: currentText,
            original_topic: post.topic || post.prompt_text
        });
    };

    window.regenerateGlobal = async () => {
        const post = livePosts.find(p => p.id === currentPostId || p.post_id === currentPostId);
        if (!post) return showToast("Post not found", 'error');

        const platformSelectors = document.querySelectorAll('.platform-selector:checked');
        const fieldSelectors = document.querySelectorAll('.field-selector:checked');
        
        let selectionList = [];
        let platformsFullySelected = [];
        let contextData = {};

        platformSelectors.forEach(cb => {
            const plat = cb.dataset.platform;
            selectionList.push(`${plat}|all`);
            platformsFullySelected.push(plat);
            
            // Collect current content for context
            const currentContent = post.content[plat] || {};
            contextData[plat] = {
                current_image: currentContent.image_suggestion || "",
                current_text: currentContent.post_text || currentContent.post || currentContent.caption || ""
            };
        });

        fieldSelectors.forEach(cb => {
            const plat = cb.dataset.platform;
            if (!platformsFullySelected.includes(plat)) {
                selectionList.push(`${plat}|${cb.dataset.fieldType}`);
                
                // Collect current content
                if (!contextData[plat]) {
                    const currentContent = post.content[plat] || {};
                    contextData[plat] = {
                        current_image: currentContent.image_suggestion || "",
                        current_text: currentContent.post_text || currentContent.post || currentContent.caption || ""
                    };
                }
            }
        });

        let payloadPlatform = "";
        let payloadType = "";
        let promptMessage = "";

        if (selectionList.length > 0) {
            payloadPlatform = selectionList.join(','); 
            payloadType = "granular_list"; 
            promptMessage = `What improvements do you want for the ${selectionList.length} selected items?\n(AI will see current content and improve based on your feedback)`;
        } else {
            payloadPlatform = "all_platforms";
            payloadType = "all";
            promptMessage = "What improvements do you want for ALL platforms?\n(AI will see all current content and improve based on your feedback)";
        }

        const feedback = prompt(promptMessage);
        if (!feedback) return;

        sendRegenRequest(payloadPlatform, payloadType, feedback, {
            context_data: contextData,
            original_topic: post.topic || post.prompt_text
        });
    };

    async function sendRegenRequest(platform, type, feedback, contextData = {}) {
        try {
            const response = await fetch(CONFIG.URLS.REGENERATE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    post_id: currentPostId,
                    platform: platform,
                    type: type,
                    feedback: feedback,
                    current_image_url: contextData.current_image_url || "",
                    current_post_text: contextData.current_post_text || "",
                    original_topic: contextData.original_topic || "",
                    context_data: contextData.context_data || {},
                    "Persona-ID": persona_id,
                    "Secret-Key": secret_key
                })
            });

            if (!response.ok) throw new Error('Regen request failed');

            showToast('Regeneration started! AI is analyzing your current content...', 'success');
            closeModal();
            const post = livePosts.find(p => p.id === currentPostId || p.post_id === currentPostId);
            if(post) post.status = 'regenerating';
            renderReviewTable(livePosts);

        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    const handleApprove = async () => {
        const post = livePosts.find(p => p.id === currentPostId || p.post_id === currentPostId);
        if (!post) return;

        const editedContent = JSON.parse(JSON.stringify(post.content));
        const inputs = modalContentContainer.querySelectorAll('textarea');
        
        inputs.forEach(input => {
            const plat = input.dataset.platform;
            const field = input.dataset.field; 
            
            if (editedContent[plat]) {
                editedContent[plat][field] = input.value;
                if (editedContent[plat].post) editedContent[plat].post = input.value;
                if (editedContent[plat].caption) editedContent[plat].caption = input.value;
                if (editedContent[plat].description) editedContent[plat].description = input.value;
                if (editedContent[plat].script) editedContent[plat].script = input.value;
            }
        });

        approveBtn.disabled = true;
        approveBtn.innerHTML = '<span class="spinner"></span> Approving...';

        try {
            const response = await fetch(CONFIG.URLS.APPROVE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    post_id: currentPostId,
                    edited_content: JSON.stringify(editedContent),
                    "Persona-ID": persona_id
                })
            });

            if (!response.ok) throw new Error('Approval failed');

            showToast('Approved & Published!', 'success');
            closeModal();
            fetchAndRenderReviewTable();

        } catch (error) {
            showToast(error.message, 'error');
            approveBtn.disabled = false;
            approveBtn.innerHTML = 'Approve & Publish';
        }
    };

    window.triggerDelete = async (postId, btn) => {
        if (btn.dataset.confirmed !== 'true') {
            btn.dataset.confirmed = 'true';
            btn.classList.add('delete-confirm');
            btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Confirm?';
            setTimeout(() => {
                btn.dataset.confirmed = 'false';
                btn.classList.remove('delete-confirm');
                btn.innerHTML = '<i class="fas fa-trash"></i>';
            }, 3000);
            return;
        }
        btn.innerHTML = '<span class="spinner"></span>';
        try {
            await fetch(CONFIG.URLS.DELETE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: postId, "Persona-ID": persona_id })
            });
            showToast('Deleted successfully', 'success');
            fetchAndRenderReviewTable();
        } catch (error) {
            showToast('Delete failed', 'error');
        }
    };

    const closeModal = () => {
        modal.style.display = 'none';
        currentPostId = null;
    };

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (approveBtn) approveBtn.addEventListener('click', handleApprove);

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(l => l.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));
            link.classList.add('active');
            document.getElementById(link.dataset.page + 'Page').classList.add('active');
            if (link.dataset.page === 'review') fetchAndRenderReviewTable();
        });
    });

    setupFormSubmit();
    
    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink && activeLink.dataset.page === 'review') {
        fetchAndRenderReviewTable();
    }
    
    setPersistentStatus('', false);
});