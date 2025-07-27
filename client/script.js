// Utility function to escape HTML content to prevent XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

document.addEventListener('DOMContentLoaded', () => {
  const postForm = document.getElementById('postForm');
  const postsContainer = document.getElementById('posts');
  const neighborhoodSelect = document.getElementById('filterNeighborhood');
  // Note: categorySelect replaced by filterTagsSelect for multi-select categories
  const tagsSelect = document.getElementById('tags');
  const filterTagsSelect = document.getElementById('filterTags');
  const searchInput = document.getElementById('search');
  const imagesInput = document.getElementById('images');

  // Predefined categories/tags for posts and filters
  const categoriesList = [
    'Housing',
    'Jobs',
    'Services',
    'Events',
    'Food',
    'Cultural',
  ];

  /**
   * Populate a multi-select element with the predefined categories.
   * @param {HTMLSelectElement} selectEl
   */
  function populateCategories(selectEl) {
    if (!selectEl) return;
    // Clear existing options
    selectEl.innerHTML = '';
    categoriesList.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat.toLowerCase();
      option.textContent = cat;
      selectEl.appendChild(option);
    });
  }

  // Populate categories on initial load
  populateCategories(tagsSelect);
  populateCategories(filterTagsSelect);

  // Keep track of which post is being edited (null when creating a new post)
  let editingPostId = null;
  // Reference to the submit button so we can change its label when editing
  const submitBtn = postForm.querySelector('.button');

  // Authentication state
  let token = localStorage.getItem('token') || null;
  let currentUserId = null;
  let currentUsername = null;
  let currentUserRole = null;
  let isRegisterMode = false;

  // Elements for authentication UI
  const authCard = document.getElementById('authCard');
  const userCard = document.getElementById('userCard');
  const authForm = document.getElementById('authForm');
  const authTitle = document.getElementById('authTitle');
  const authSubmit = document.getElementById('authSubmit');
  const switchAuth = document.getElementById('switchAuth');
  const toggleAuthMsg = document.getElementById('toggleAuth');
  const logoutBtn = document.getElementById('logoutBtn');
  const currentUserSpan = document.getElementById('currentUser');
  // Post form card for toggling visibility
  const formCard = document.querySelector('.form-card');

  // Admin dashboard elements
  const adminCard = document.getElementById('adminCard');
  const pendingPostsList = document.getElementById('pendingPostsList');
  const usersList = document.getElementById('usersList');

  // Messaging elements
  const messagesBtn = document.getElementById('messagesBtn');
  const messagesCard = document.getElementById('messagesCard');
  // New conversation select (used to start a conversation with a user not in the list)
  const recipientSelect = document.getElementById('recipientSelect');
  // Conversation list and panel elements
  const conversationsListEl = document.getElementById('conversationsList');
  const conversationTitleEl = document.getElementById('conversationTitle');
  const messagesListEl = document.getElementById('messagesList');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const typingIndicatorEl = document.getElementById('typingIndicator');

  // Register service worker for offline capabilities and notifications
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => {
        console.error('Service worker registration failed:', err);
      });
  }
  // Currently selected recipient for conversation
  let selectedRecipientId = null;
  // Mapping of userId to username for new conversation selection
  let usersMap = {};
  // Socket.IO client instance
  let socket = null;

  // My posts filtering
  let filterMyPosts = false;
  const myPostsBtn = document.getElementById('myPostsBtn');

  /**
   * Decode the JWT token to extract the current user ID and username.
   */
  function decodeToken() {
    currentUserId = null;
    currentUsername = null;
    currentUserRole = null;
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        currentUserId = payload.id;
        currentUsername = payload.username;
        currentUserRole = payload.role || 'user';
      } catch (e) {
        console.error('Failed to decode token', e);
      }
    }
  }

  /**
   * Update the authentication UI based on whether a user is logged in.
   */
  function updateAuthUI() {
    if (token && currentUserId) {
      // Show user card
      authCard.classList.add('hidden');
      userCard.classList.remove('hidden');
      currentUserSpan.textContent = currentUsername;
      // Show post form
      formCard.classList.remove('hidden');
      // Reset My Posts filter when logging in
      filterMyPosts = false;
      if (myPostsBtn) myPostsBtn.textContent = 'My Posts';

      // Show admin dashboard if user is an admin
      if (currentUserRole === 'admin') {
        adminCard.classList.remove('hidden');
        // Load admin data
        loadAdminData();
      } else {
        adminCard.classList.add('hidden');
      }

      // Show messages button
      if (messagesBtn) {
        messagesBtn.classList.remove('hidden');
      }
      // Establish socket connection for real-time messaging
      connectSocket();
      // Populate users for messaging and conversations
      loadUsersList();
      loadConversations();

      // Request notification permission for web notifications
      requestNotificationPermission();

      // Subscribe to push notifications
      subscribeToPush();
    } else {
      // Show login/register form
      authCard.classList.remove('hidden');
      userCard.classList.add('hidden');
      // Hide post form
      formCard.classList.add('hidden');
      // Hide admin dashboard when logged out
      adminCard.classList.add('hidden');

      // Hide messages button and card when logged out
      if (messagesBtn) messagesBtn.classList.add('hidden');
      messagesCard.classList.add('hidden');
      // Disconnect socket and reset messaging state
      disconnectSocket();
      selectedRecipientId = null;
      // Reset recipient list and message list
      if (recipientSelect) {
        recipientSelect.innerHTML = '<option value="">Select a user</option>';
      }
      if (messagesListEl) messagesListEl.innerHTML = '';
      if (messageForm) messageForm.classList.add('hidden');
      // Reset conversations and title when logging out
      if (conversationsListEl) conversationsListEl.innerHTML = '';
      if (conversationTitleEl) conversationTitleEl.textContent = '';
    }
  }

  /**
   * Switch between login and registration modes.
   */
  function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    if (isRegisterMode) {
      authTitle.textContent = 'Register';
      authSubmit.textContent = 'Register';
      toggleAuthMsg.innerHTML = 'Already have an account? <a href="#" id="switchAuth">Login here</a>';
    } else {
      authTitle.textContent = 'Login';
      authSubmit.textContent = 'Login';
      toggleAuthMsg.innerHTML = "Don't have an account? <a href=\"#\" id=\"switchAuth\">Register here</a>";
    }
  }

  // Listen for toggling between login and register
  toggleAuthMsg.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.id === 'switchAuth') {
      e.preventDefault();
      toggleAuthMode();
    }
  });

  // Handle authentication form submit (login or register)
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!username || !password) {
      alert('Please enter both username and password');
      return;
    }
    const url = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.message || 'Authentication failed');
          });
        }
        return res.json();
      })
      .then((data) => {
        token = data.token;
        localStorage.setItem('token', token);
        decodeToken();
        updateAuthUI();
        // Reset form
        authForm.reset();
        // Load posts now that user is logged in
        loadPosts();
      })
      .catch((err) => {
        console.error(err);
        alert(err.message);
      });
  });

  // Logout handler
  logoutBtn.addEventListener('click', () => {
    token = null;
    currentUserId = null;
    currentUsername = null;
    localStorage.removeItem('token');
    resetEditingState();
    // Reset my posts filter on logout
    filterMyPosts = false;
    if (myPostsBtn) myPostsBtn.textContent = 'My Posts';
    updateAuthUI();
    loadPosts();
  });

  // Toggle between "My Posts" and "All Posts"
  if (myPostsBtn) {
    myPostsBtn.addEventListener('click', () => {
      filterMyPosts = !filterMyPosts;
      myPostsBtn.textContent = filterMyPosts ? 'All Posts' : 'My Posts';
      loadPosts();
    });
  }

  // Decode token on initial load and set up UI
  decodeToken();
  updateAuthUI();

  // Set current year in footer
  document.getElementById('year').textContent = new Date().getFullYear();

  /**
   * Fetch posts from the API with optional query parameters and render them.
   */
  function loadPosts() {
    let url = '/api/posts';
    const params = [];
    const neighborhoodVal = neighborhoodSelect.value;
    // Build comma-separated list of selected filter tags
    const selectedFilterTags = Array.from(filterTagsSelect.selectedOptions).map((opt) => opt.value);
    const searchVal = searchInput ? searchInput.value.trim() : '';
    if (neighborhoodVal) params.push('neighborhood=' + encodeURIComponent(neighborhoodVal));
    if (selectedFilterTags.length > 0) params.push('tags=' + encodeURIComponent(selectedFilterTags.join(',')));
    if (searchVal) params.push('q=' + encodeURIComponent(searchVal));
    // Include userId when filtering to current user's posts
    if (filterMyPosts && currentUserId) {
      params.push('userId=' + encodeURIComponent(currentUserId));
    }
    if (params.length) url += '?' + params.join('&');
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        // Clear container
        postsContainer.innerHTML = '';
        const neighborhoods = new Set();
        const categories = new Set();
        data.forEach((post) => {
          neighborhoods.add(post.neighborhood);
          // Create card element
          const card = document.createElement('div');
          card.className = 'card post-card';
          // Determine ownership
          const isOwner = token && currentUserId && post.user === currentUserId;
          // Build images container if images exist
          let imagesHtml = '';
          if (post.images && post.images.length > 0) {
            const imgs = post.images
              .map((url) => `<img src="${url}" alt="Post image" />`)
              .join('');
            imagesHtml = `<div class="images">${imgs}</div>`;
          }
          // Compose safe HTML pieces
          const contentHtml = escapeHtml(post.content);
          const neighborhoodHtml = escapeHtml(post.neighborhood);
          const tagsHtml = (post.tags || [])
            .map((tag) => {
              const safeTag = escapeHtml(tag);
              return `<span class="tag tag-category">🏷️ ${safeTag}</span>`;
            })
            .join('');
          const date = new Date(post.createdAt).toLocaleString();
          // Actions HTML if owner
          const actionsHtml = isOwner
            ? `<div class="actions">
                <button class="action-button edit" data-id="${post._id}">Edit</button>
                <button class="action-button delete" data-id="${post._id}">Delete</button>
              </div>`
            : '';
          // Assemble card inner content
          card.innerHTML = `
            ${imagesHtml}
            <p>${contentHtml}</p>
            <div class="tags">
              <span class="tag tag-neighborhood">📍 ${neighborhoodHtml}</span>
              ${tagsHtml}
            </div>
            <div class="date">${date}</div>
            ${actionsHtml}
          `;
          // Attach edit/delete handlers for owner
          if (isOwner) {
            const editBtn = card.querySelector('.edit');
            editBtn.addEventListener('click', () => startEdit(post));
            const deleteBtn = card.querySelector('.delete');
            deleteBtn.addEventListener('click', () => deletePost(post._id));
          }
          // Create comments section container
          const commentsSection = document.createElement('div');
          commentsSection.className = 'comments-section';
          // Comments list element
          const commentsList = document.createElement('div');
          commentsList.className = 'comments-list';
          commentsSection.appendChild(commentsList);
          // Comment form (only show if authenticated)
          if (token && currentUserId) {
            const commentForm = document.createElement('form');
            commentForm.className = 'comment-form';
            commentForm.innerHTML = `
              <input type="text" class="comment-input" placeholder="Write a comment..." required />
              <button type="submit" class="comment-submit">Post</button>
            `;
            // Submit handler
            commentForm.addEventListener('submit', (e) => {
              e.preventDefault();
              const input = commentForm.querySelector('.comment-input');
              const content = input.value.trim();
              if (!content) return;
              // Send comment to server
              fetch(`/api/posts/${post._id}/comments`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: 'Bearer ' + token,
                },
                body: JSON.stringify({ content }),
              })
                .then((res) => {
                  if (!res.ok) {
                    return res.json().then((err) => {
                      throw new Error(err.message || 'Failed to post comment');
                    });
                  }
                  return res.json();
                })
                .then((comment) => {
                  // Clear input
                  input.value = '';
                  // Append new comment to list
                  appendComment(comment, commentsList);
                })
                .catch((err) => {
                  console.error(err);
                  alert(err.message);
                });
            });
            commentsSection.appendChild(commentForm);
          }
          // Append comments section after card content
          card.appendChild(commentsSection);
          // Append card to container
          postsContainer.appendChild(card);
          // Load existing comments for this post
          loadComments(post._id, commentsList);
        });
        updateSelectOptions(neighborhoodSelect, neighborhoods, 'All neighborhoods');
      })
      .catch((err) => {
        console.error(err);
        postsContainer.innerHTML = '<p>Error loading posts.</p>';
      });
  }

  /**
   * Replace the options in a <select> except for the first placeholder option.
   * @param {HTMLSelectElement} select
   * @param {Set} items
   * @param {String} placeholder
   */
  function updateSelectOptions(select, items, placeholder) {
    // Save current value to preserve selection if possible
    const current = select.value;
    // Remove all options
    select.innerHTML = '';
    // Add placeholder
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);
    // Add new options
    Array.from(items)
      .sort((a, b) => a.localeCompare(b))
      .forEach((item) => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = item;
        if (item === current) {
          option.selected = true;
        }
        select.appendChild(option);
      });
  }

  /**
   * Start editing an existing post. Populates the form with the post's
   * data and sets the editing state. The submit button label and form
   * appearance are updated accordingly.
   *
   * @param {Object} post The post object to edit
   */
  function startEdit(post) {
    editingPostId = post._id;
    document.getElementById('content').value = post.content;
    document.getElementById('neighborhood').value = post.neighborhood;
    // Preselect tags in the multi-select
    if (tagsSelect) {
      const selectedSet = new Set((post.tags || []).map((t) => t.toLowerCase()));
      Array.from(tagsSelect.options).forEach((opt) => {
        opt.selected = selectedSet.has(opt.value);
      });
    }
    submitBtn.textContent = 'Update';
    // Mark form as editing for styling
    postForm.classList.add('editing');
    // Scroll to form for user convenience
    postForm.scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * Send a DELETE request to remove a post. Upon success the posts
   * are reloaded. A confirmation dialog is presented to the user.
   *
   * @param {String} id The MongoDB _id of the post to delete
   */
  function deletePost(id) {
    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }
    fetch('/api/posts/' + id, {
      method: 'DELETE',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.message || 'Failed to delete post');
          });
        }
        return res.json();
      })
      .then(() => {
        // If we were editing this post, reset the form
        if (editingPostId === id) {
          resetEditingState();
        }
        loadPosts();
      })
      .catch((err) => {
        console.error(err);
        alert(err.message);
      });
  }

  /**
   * Reset the form to creation mode after editing or deleting a post.
   */
  function resetEditingState() {
    editingPostId = null;
    postForm.reset();
    submitBtn.textContent = 'Post';
    postForm.classList.remove('editing');
  }

  // Event listener for form submission
  postForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = document.getElementById('content').value.trim();
    const neighborhood = document.getElementById('neighborhood').value.trim();
    // Collect selected tags from the multi-select. At least one tag is required.
    const selectedTags = Array.from(tagsSelect.selectedOptions).map((opt) => opt.value);
    if (!content || !neighborhood || selectedTags.length === 0) {
      alert('Please fill in all fields and choose at least one category.');
      return;
    }
    // Determine whether to create a new post or update an existing one
    const url = editingPostId ? '/api/posts/' + editingPostId : '/api/posts';
    const method = editingPostId ? 'PUT' : 'POST';
    // Build a FormData object for fields and any selected images
    const formData = new FormData();
    formData.append('content', content);
    formData.append('neighborhood', neighborhood);
    // Append each selected tag separately for server-side array parsing
    selectedTags.forEach((tag) => {
      formData.append('tags', tag);
    });
    if (imagesInput && imagesInput.files && imagesInput.files.length > 0) {
      Array.from(imagesInput.files).forEach((file) => {
        formData.append('images', file);
      });
    }
    fetch(url, {
      method,
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: formData,
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.message || (editingPostId ? 'Failed to update post' : 'Failed to create post'));
          });
        }
        return res.json();
      })
      .then(() => {
        if (editingPostId) {
          resetEditingState();
        } else {
          postForm.reset();
        }
        // Reset image input manually since form.reset() might not clear it in some browsers
        if (imagesInput) {
          imagesInput.value = '';
        }
        loadPosts();
      })
      .catch((err) => {
        console.error(err);
        alert(err.message);
      });
  });

  // Event listeners for filters
  neighborhoodSelect.addEventListener('change', loadPosts);
  filterTagsSelect.addEventListener('change', loadPosts);

  // Trigger search when user types in the search box
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      loadPosts();
    });
  }

  // Initial load
  loadPosts();

  /**
   * Load data for the admin dashboard: pending posts and user list. Only
   * available to users with the admin role. Fetches unapproved posts and
   * all users, then renders them in their respective containers. If any
   * requests fail, an error is logged and a simple message is displayed.
   */
  function loadAdminData() {
    if (!token || currentUserRole !== 'admin') return;
    // Fetch unapproved posts
    fetch('/api/admin/posts?approved=false', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((res) => res.json())
      .then((posts) => {
        pendingPostsList.innerHTML = '';
        if (!Array.isArray(posts) || posts.length === 0) {
          pendingPostsList.innerHTML = '<p>No pending posts.</p>';
          return;
        }
        posts.forEach((post) => {
          const div = document.createElement('div');
          div.className = 'admin-post';
          // Compose safe content
          const contentHtml = escapeHtml(post.content);
          const userHtml = post.user && post.user.username ? escapeHtml(post.user.username) : 'Unknown';
          const date = new Date(post.createdAt).toLocaleString();
          // Build actions
          div.innerHTML = `
            <p><strong>${userHtml}</strong>: ${contentHtml}</p>
            <p><em>${date}</em></p>
            <div class="actions">
              <button class="approve-btn">Approve</button>
              <button class="delete-btn">Delete</button>
            </div>
          `;
          const approveBtn = div.querySelector('.approve-btn');
          const deleteBtn = div.querySelector('.delete-btn');
          approveBtn.addEventListener('click', () => {
            fetch(`/api/admin/posts/${post._id}/approve`, {
              method: 'PUT',
              headers: { Authorization: 'Bearer ' + token },
            })
              .then((r) => r.json())
              .then(() => {
                loadAdminData();
                // Refresh posts list so newly approved post appears
                loadPosts();
              })
              .catch((err) => {
                console.error(err);
                alert('Failed to approve post');
              });
          });
          deleteBtn.addEventListener('click', () => {
            if (!confirm('Are you sure you want to delete this post?')) return;
            fetch(`/api/admin/posts/${post._id}`, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token },
            })
              .then((r) => r.json())
              .then(() => {
                loadAdminData();
                loadPosts();
              })
              .catch((err) => {
                console.error(err);
                alert('Failed to delete post');
              });
          });
          pendingPostsList.appendChild(div);
        });
      })
      .catch((err) => {
        console.error(err);
        pendingPostsList.innerHTML = '<p>Error loading pending posts.</p>';
      });
    // Fetch users
    fetch('/api/admin/users', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((res) => res.json())
      .then((users) => {
        usersList.innerHTML = '';
        if (!Array.isArray(users) || users.length === 0) {
          usersList.innerHTML = '<p>No users found.</p>';
          return;
        }
        users.forEach((user) => {
          const item = document.createElement('div');
          item.className = 'user-item';
          const name = escapeHtml(user.username);
          const role = user.role;
          item.innerHTML = `
            <span>${name} (${role})</span>
            <div class="user-actions"></div>
          `;
          const actionsDiv = item.querySelector('.user-actions');
          // Do not show role change buttons for yourself
          if (user._id !== currentUserId) {
            if (role === 'user') {
              const promoteBtn = document.createElement('button');
              promoteBtn.className = 'promote-btn';
              promoteBtn.textContent = 'Make Admin';
              promoteBtn.addEventListener('click', () => {
                updateUserRole(user._id, 'admin');
              });
              actionsDiv.appendChild(promoteBtn);
            } else if (role === 'admin') {
              const demoteBtn = document.createElement('button');
              demoteBtn.className = 'demote-btn';
              demoteBtn.textContent = 'Make User';
              demoteBtn.addEventListener('click', () => {
                updateUserRole(user._id, 'user');
              });
              actionsDiv.appendChild(demoteBtn);
            }
          }
          usersList.appendChild(item);
        });
      })
      .catch((err) => {
        console.error(err);
        usersList.innerHTML = '<p>Error loading users.</p>';
      });
  }

  /**
   * Update a user's role via the admin API. After the update, reload the
   * admin data to reflect changes. If the request fails, an error
   * notification is shown.
   * @param {String} userId The ID of the user whose role to change
   * @param {String} role The new role ('user' or 'admin')
   */
  function updateUserRole(userId, role) {
    fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ role }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.message || 'Failed to update user role');
          });
        }
        return res.json();
      })
      .then(() => {
        loadAdminData();
      })
      .catch((err) => {
        console.error(err);
        alert(err.message);
      });
  }

  // --------------------------- Messaging Functions ---------------------------

  /**
   * Establish a Socket.IO connection for the authenticated user. If a
   * connection already exists, it will be reused. The token is sent in
   * the auth payload for server-side validation. Listens for incoming
   * messages and handles them appropriately.
   */
  function connectSocket() {
    if (!token || (socket && socket.connected)) return;
    try {
      socket = io({ auth: { token } });
      socket.on('newMessage', (msg) => {
        handleNewMessage(msg);
      });
      // Listen for read receipt notifications from other users
      socket.on('messagesRead', ({ from }) => {
        handleMessagesRead(from);
      });
      // Listen for typing indicators
      socket.on('typing', ({ from }) => {
        handleTyping(from);
      });
      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
      });
    } catch (err) {
      console.error('Failed to connect to socket:', err);
    }
  }

  /**
   * Disconnect the active Socket.IO connection and remove listeners.
   */
  function disconnectSocket() {
    if (socket) {
      socket.off('newMessage');
      socket.disconnect();
      socket = null;
    }
  }

  /**
   * Load a list of all users for the messaging recipient select. Excludes
   * the current user from the list. The list is only fetched once per
   * session unless a new user logs in.
   */
  function loadUsersList() {
    if (!token) return;
    fetch('/api/users', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((res) => res.json())
      .then((users) => {
        // Build mapping for username lookup
        usersMap = {};
        // Clear existing options
        if (recipientSelect) {
          recipientSelect.innerHTML = '<option value="">Select a user</option>';
        }
        users.forEach((user) => {
          usersMap[user._id] = user.username;
          if (recipientSelect && user._id !== currentUserId) {
            const option = document.createElement('option');
            option.value = user._id;
            option.textContent = user.username;
            recipientSelect.appendChild(option);
          }
        });
      })
      .catch((err) => {
        console.error(err);
      });
  }

  /**
   * Load conversation summaries for the current user and render them in
   * the sidebar. Each conversation shows the other user's name, a
   * preview of the most recent message, and an unread count badge. If
   * there are no conversations, displays a placeholder message. This
   * function resets the active state on all items.
   */
  function loadConversations() {
    if (!token) return;
    fetch('/api/messages/conversations', {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((res) => res.json())
      .then((convs) => {
        conversationsListEl.innerHTML = '';
        if (!convs || convs.length === 0) {
          const emptyEl = document.createElement('p');
          emptyEl.textContent = 'No conversations yet.';
          conversationsListEl.appendChild(emptyEl);
          return;
        }
        convs.forEach((conv) => {
          const item = renderConversationItem(conv);
          conversationsListEl.appendChild(item);
        });
        // Highlight active conversation if selected
        highlightActiveConversation();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  /**
   * Render a single conversation summary into a DOM element. The element
   * includes click handling to open the conversation when selected.
   *
   * @param {Object} conv Conversation summary
   */
  function renderConversationItem(conv) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.userId = conv.otherId;
    // Info container for name and preview
    const info = document.createElement('div');
    info.className = 'conv-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'conv-name';
    nameEl.textContent = conv.otherUsername;
    const previewEl = document.createElement('div');
    previewEl.className = 'conv-preview';
    // Truncate preview for long messages
    let preview = conv.lastMessage || '';
    if (preview.length > 40) {
      preview = preview.substring(0, 40) + '...';
    }
    previewEl.textContent = preview;
    info.appendChild(nameEl);
    info.appendChild(previewEl);
    item.appendChild(info);
    // Unread badge
    if (conv.unreadCount && conv.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = conv.unreadCount;
      item.appendChild(badge);
    }
    // Click handler to open conversation
    item.addEventListener('click', () => {
      openConversation(conv.otherId, conv.otherUsername);
    });
    return item;
  }

  /**
   * Highlight the active conversation in the sidebar by adding the
   * `active` class to the corresponding conversation item.
   */
  function highlightActiveConversation() {
    const items = conversationsListEl.querySelectorAll('.conversation-item');
    items.forEach((el) => {
      if (selectedRecipientId && el.dataset.userId === selectedRecipientId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  /**
   * Open a conversation with a specific user. Sets the selected recipient,
   * updates the title, loads the message history, shows the message form,
   * marks unread messages as read, and updates the conversation list.
   *
   * @param {String} otherId The ID of the other user
   * @param {String} otherUsername The username of the other user
   */
  function openConversation(otherId, otherUsername) {
    selectedRecipientId = otherId;
    // Set conversation title
    if (conversationTitleEl) {
      conversationTitleEl.textContent = otherUsername;
    }
    // Clear existing messages and reset input
    messagesListEl.innerHTML = '';
    messageInput.value = '';
    // Show message form
    messageForm.classList.remove('hidden');
    // Mark messages as read first, then load conversation so read flags are up to date
    markMessagesAsRead(otherId);
    loadConversation(otherId);
    // Highlight the active conversation
    highlightActiveConversation();
  }

  /**
   * Mark all unread messages from the specified user as read. After
   * successfully marking messages, refreshes the conversation list so
   * unread badges update.
   *
   * @param {String} otherId
   */
  function markMessagesAsRead(otherId) {
    fetch('/api/messages/read?with=' + encodeURIComponent(otherId), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(() => {
        // Reload conversations to update unread count
        loadConversations();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  /**
   * Load the conversation between the current user and the selected recipient.
   * Messages are displayed in chronological order. If no recipient is
   * selected, clears the conversation and hides the message form.
   */
  function loadConversation(recipientId) {
    messagesListEl.innerHTML = '';
    if (!recipientId) {
      messageForm.classList.add('hidden');
      return;
    }
    messageForm.classList.remove('hidden');
    fetch('/api/messages?with=' + encodeURIComponent(recipientId), {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then((res) => res.json())
      .then((msgs) => {
        msgs.forEach((msg) => {
          renderMessage(msg);
        });
      })
      .catch((err) => {
        console.error(err);
        messagesListEl.innerHTML = '<p>Error loading messages.</p>';
      });
  }

  /**
   * Render a single message in the messages list. Messages sent by the
   * current user are styled differently from those received.
   *
   * @param {Object} msg The message object returned from the API/socket
   */
  function renderMessage(msg) {
    const isSent = msg.sender && msg.sender._id
      ? msg.sender._id === currentUserId
      : msg.sender === currentUserId;
    const content = escapeHtml(msg.content);
    const dateStr = new Date(msg.createdAt).toLocaleString();
    const messageEl = document.createElement('div');
    messageEl.className = 'message ' + (isSent ? 'sent' : 'received');
    // Set dataset attributes for message id and read status
    if (msg._id) messageEl.dataset.messageId = msg._id;
    if (typeof msg.read !== 'undefined') messageEl.dataset.read = msg.read;
    // Build read status indicator for sent messages
    let readStatusHtml = '';
    if (isSent) {
      const readIcon = msg.read ? '✓✓' : '✓';
      readStatusHtml = `<span class="read-status">${readIcon}</span>`;
    }
    messageEl.innerHTML = `${content}<span class="message-date">${dateStr}</span>${readStatusHtml}`;
    messagesListEl.appendChild(messageEl);
    // Scroll to bottom on new message
    messagesListEl.scrollTop = messagesListEl.scrollHeight;
  }

  /**
   * Handler for incoming messages via Socket.IO. If the message is part of
   * the currently open conversation (i.e., involves the current user and
   * selected recipient), it is rendered immediately. Otherwise, a simple
   * alert is shown to notify the user of a new message.
   *
   * @param {Object} msg The message object delivered by the server
   */
  function handleNewMessage(msg) {
    const involvesCurrentUser =
      (msg.sender && (msg.sender._id === currentUserId || msg.sender === currentUserId)) ||
      (msg.recipient && (msg.recipient._id === currentUserId || msg.recipient === currentUserId));
    if (!involvesCurrentUser) return;
    // Determine the ID of the other participant
    const otherId = msg.sender && msg.sender._id
      ? (msg.sender._id === currentUserId ? (msg.recipient._id || msg.recipient) : msg.sender._id)
      : (msg.sender === currentUserId ? msg.recipient : msg.sender);
    // If currently viewing this conversation, render it
    if (selectedRecipientId && otherId && otherId === selectedRecipientId) {
      // If this message belongs to the open conversation, render it
      renderMessage(msg);
      // Mark messages as read (in case the incoming message is from the other user)
      if (msg.sender && (msg.sender._id === otherId || msg.sender === otherId)) {
        markMessagesAsRead(otherId);
      }
    } else {
      // Notify user of a new message from other user
      const senderName = msg.sender && msg.sender.username ? msg.sender.username : 'Someone';
      // Show web notification if permission granted; fall back to alert
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const body = msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content;
          new Notification(`New message from ${senderName}`, { body });
        } catch (e) {
          alert(`New message from ${senderName}`);
        }
      } else {
        alert(`New message from ${senderName}`);
      }
    }
    // Refresh conversations list to update previews and unread counts
    loadConversations();
  }

  /**
   * Handle read receipt events from Socket.IO. When the other user
   * acknowledges reading messages, update the read status indicators
   * for all messages sent to them in the currently open conversation.
   * Also refresh the conversation list.
   *
   * @param {String} from The ID of the user who read the messages
   */
  function handleMessagesRead(from) {
    // Only update if the read receipts come from the currently open conversation
    if (selectedRecipientId && from === selectedRecipientId) {
      // Iterate over message elements and update read status for sent messages
      const messageEls = messagesListEl.querySelectorAll('.message.sent');
      messageEls.forEach((el) => {
        // Update data-read attribute and icon if not already read
        if (el.dataset.read !== 'true') {
          el.dataset.read = 'true';
          const statusEl = el.querySelector('.read-status');
          if (statusEl) statusEl.textContent = '✓✓';
        }
      });
      // Refresh conversations to clear unread counts
      loadConversations();
    }
  }

  /**
   * Ask the user for permission to display notifications. If permission
   * is already granted or denied, this function does nothing. This
   * should be called after login so the permission prompt does not
   * appear unexpectedly on page load.
   */
  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch((err) => {
        console.error('Notification permission request failed:', err);
      });
    }
  }

  /**
   * Convert a base64 string to a Uint8Array. Required for
   * applicationServerKey when subscribing to push.
   *
   * @param {String} base64String
   */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Subscribe the current user to Web Push notifications. Retrieves the
   * VAPID public key from the server, registers with the service
   * worker's push manager, and sends the subscription object to the
   * server for storage. Requires a logged-in user and a registered
   * service worker.
   */
  function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!token) return;
    // Get VAPID public key from server
    fetch('/api/vapidPublicKey')
      .then((res) => res.json())
      .then(({ publicKey }) => {
        if (!publicKey) throw new Error('Missing VAPID public key');
        return navigator.serviceWorker.ready.then((registration) =>
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          })
        );
      })
      .then((subscription) => {
        // Send subscription to server
        return fetch('/api/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify(subscription),
        });
      })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.message || 'Failed to save subscription');
          });
        }
      })
      .catch((err) => {
        console.error('Push subscription error:', err);
      });
  }

  /**
   * Handle typing notifications from Socket.IO. Displays a transient
   * indicator that the conversation partner is typing. The indicator
   * automatically hides after a short delay unless refreshed by
   * subsequent typing events.
   *
   * @param {String} from The ID of the user who is typing
   */
  let typingTimeoutId = null;
  function handleTyping(from) {
    if (!selectedRecipientId || from !== selectedRecipientId) return;
    // Show typing indicator with username
    if (typingIndicatorEl && usersMap[from]) {
      typingIndicatorEl.textContent = `${usersMap[from]} is typing...`;
      typingIndicatorEl.classList.remove('hidden');
      // Reset timeout
      if (typingTimeoutId) clearTimeout(typingTimeoutId);
      typingTimeoutId = setTimeout(() => {
        typingIndicatorEl.classList.add('hidden');
      }, 1000);
    }
  }

  // Event listener for messages button
  if (messagesBtn) {
    messagesBtn.addEventListener('click', () => {
      // Toggle visibility
      messagesCard.classList.toggle('hidden');
      if (!messagesCard.classList.contains('hidden')) {
        // When showing the messaging interface, load conversations and users
        selectedRecipientId = null;
        conversationTitleEl.textContent = '';
        messagesListEl.innerHTML = '';
        messageForm.classList.add('hidden');
        messageInput.value = '';
        loadConversations();
        loadUsersList();
      }
    });
  }

  // Event listener for recipient selection change
  if (recipientSelect) {
    recipientSelect.addEventListener('change', () => {
      const newId = recipientSelect.value || null;
      if (!newId) return;
      // Determine username from usersMap
      const username = usersMap[newId] || '';
      openConversation(newId, username);
      // Reset the select to placeholder
      recipientSelect.value = '';
    });
  }

  // Event listener for sending a message
  if (messageForm) {
    messageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const content = messageInput.value.trim();
      if (!content || !selectedRecipientId) return;
      fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ recipient: selectedRecipientId, content }),
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then((err) => {
              throw new Error(err.message || 'Failed to send message');
            });
          }
          return res.json();
        })
        .then((msg) => {
          messageInput.value = '';
          // The server will broadcast the new message via socket; optionally render immediately
          renderMessage(msg);
          // Refresh conversation list to show the latest message preview
          loadConversations();
        })
        .catch((err) => {
          console.error(err);
          alert(err.message);
        });
    });

  // Emit typing events as the user types to inform the recipient
  messageInput.addEventListener('input', () => {
    if (selectedRecipientId && socket && socket.connected) {
      socket.emit('typing', { to: selectedRecipientId });
    }
  });
  }

  /**
   * Fetch and display comments for a specific post. Comments are loaded in
   * ascending order by creation time to read like a conversation. Each
   * comment will display the username of the commenter and the comment
   * content. This function clears existing comments before rendering new ones.
   *
   * @param {String} postId The ID of the post whose comments to load
   * @param {HTMLElement} container The DOM element where comments will be appended
   */
  function loadComments(postId, container) {
    // Clear existing comments
    container.innerHTML = '';
    fetch(`/api/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((comments) => {
        comments.forEach((comment) => {
          appendComment(comment, container);
        });
      })
      .catch((err) => {
        console.error(err);
        // Show a simple error message in the comments area
        container.innerHTML = '<p class="comment-error">Failed to load comments.</p>';
      });
  }

  /**
   * Append a single comment to the comments container. Each comment shows
   * the author's username, the comment text, and a timestamp. The username
   * is escaped to prevent XSS. Comments are displayed in a simple flex
   * column layout.
   *
   * @param {Object} comment The comment object as returned from the API
   * @param {HTMLElement} container The DOM element where the comment will be appended
   */
  function appendComment(comment, container) {
    const commentEl = document.createElement('div');
    commentEl.className = 'comment';
    const username = comment.user && comment.user.username ? escapeHtml(comment.user.username) : 'Unknown';
    const content = escapeHtml(comment.content);
    const dateStr = new Date(comment.createdAt).toLocaleString();
    commentEl.innerHTML = `<strong>${username}</strong>: ${content} <span class="comment-date">${dateStr}</span>`;
    container.appendChild(commentEl);
  }
});