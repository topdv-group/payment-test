// app.js - Using Backend API instead of direct Firebase access

// Global variables
let currentUser = null;
let isOnline = navigator.onLine;

// Check online status
window.addEventListener('online', () => {
    isOnline = true;
    hideAlert('offlineAlert');
});

window.addEventListener('offline', () => {
    isOnline = false;
    showAlert('You are offline. Some features may not work.', 'error', 'initialScreen');
});

// Progress bar functions
function showProgress(containerId, fillId, textId) {
    const container = document.getElementById(containerId);
    if (container) container.style.display = 'block';
    animateProgress(fillId, textId);
}

function hideProgress(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.style.display = 'none';
}

function animateProgress(fillId, textId, duration = 2000) {
    const fill = document.getElementById(fillId);
    const text = document.getElementById(textId);
    if (!fill || !text) return;
    
    let width = 0;
    const interval = 50;
    const steps = duration / interval;
    const increment = 100 / steps;

    const timer = setInterval(() => {
        if (width >= 100) {
            clearInterval(timer);
        } else {
            width += increment;
            fill.style.width = width + '%';
        }
    }, interval);
}

function completeProgress(fillId, textId, message = "Complete!") {
    const fill = document.getElementById(fillId);
    const text = document.getElementById(textId);
    if (!fill || !text) return;
    
    fill.style.width = '100%';
    text.textContent = message;
   
    setTimeout(() => {
        if (fill) fill.style.width = '0%';
    }, 1000);
}

// Password visibility toggle
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

// Password strength checker
function checkPasswordStrength(password) {
    const strengthBar = document.getElementById('passwordStrength');
    const feedback = document.getElementById('passwordFeedback');
    
    if (!strengthBar || !feedback) return;
   
    if (password.length === 0) {
        strengthBar.className = 'password-strength';
        strengthBar.style.width = '0%';
        feedback.textContent = '';
        return;
    }
   
    if (password.length < 6) {
        strengthBar.className = 'password-strength password-weak';
        feedback.textContent = 'Password must be at least 6 characters';
        feedback.style.color = '#dc3545';
        return;
    }
   
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/\d/)) strength++;
    if (password.match(/[^a-zA-Z\d]/)) strength++;
   
    if (strength < 2) {
        strengthBar.className = 'password-strength password-weak';
        feedback.textContent = 'Weak password';
        feedback.style.color = '#dc3545';
    } else if (strength < 4) {
        strengthBar.className = 'password-strength password-medium';
        feedback.textContent = 'Medium strength password';
        feedback.style.color = '#ffc107';
    } else {
        strengthBar.className = 'password-strength password-strong';
        feedback.textContent = 'Strong password';
        feedback.style.color = '#28a745';
    }
}

function checkPasswordStrengthRef(password) {
    const strengthBar = document.getElementById('refPasswordStrength');
    const feedback = document.getElementById('refPasswordFeedback');
    
    if (!strengthBar || !feedback) return;
   
    if (password.length === 0) {
        strengthBar.className = 'password-strength';
        strengthBar.style.width = '0%';
        feedback.textContent = '';
        return;
    }
   
    if (password.length < 6) {
        strengthBar.className = 'password-strength password-weak';
        feedback.textContent = 'Password must be at least 6 characters';
        feedback.style.color = '#dc3545';
        return;
    }
   
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/\d/)) strength++;
    if (password.match(/[^a-zA-Z\d]/)) strength++;
   
    if (strength < 2) {
        strengthBar.className = 'password-strength password-weak';
        feedback.textContent = 'Weak password';
        feedback.style.color = '#dc3545';
    } else if (strength < 4) {
        strengthBar.className = 'password-strength password-medium';
        feedback.textContent = 'Medium strength password';
        feedback.style.color = '#ffc107';
    } else {
        strengthBar.className = 'password-strength password-strong';
        feedback.textContent = 'Strong password';
        feedback.style.color = '#28a745';
    }
}

function calculateWaitingTime(joinDate) {
    const join = new Date(joinDate);
    const now = new Date();
    const diffMs = now - join;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
   
    if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHrs} hour${diffHrs > 1 ? 's' : ''}`;
    } else if (diffHrs > 0) {
        return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    } else {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    }
}

// ========================
// BACKEND API FUNCTIONS (代替直接 Firebase 访问)
// ========================

// Register user via backend API
async function registerUserToDatabase(userData) {
    if (!isOnline) throw new Error('No internet connection');
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fullName: userData.name,
                phone: userData.phone,
                email: userData.email || null
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Registration failed');
        }
        
        // Store additional user data in localStorage for now
        // In production, you'd want to store this in a proper database
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        localUsers[userData.phone] = {
            ...userData,
            userId: result.userId,
            createdAt: Date.now()
        };
        localStorage.setItem('users', JSON.stringify(localUsers));
        
        return true;
    } catch (error) {
        console.error("Error registering user via API:", error);
        throw error;
    }
}

// Get user by phone via backend API
async function getUserByPhone(phone) {
    if (!isOnline) throw new Error('No internet connection');
    try {
        const response = await fetch('/api/users');
        const result = await response.json();
        
        if (result.success && result.users) {
            const users = result.users;
            for (let userId in users) {
                if (users[userId].phone === phone) {
                    // Merge with local data for additional fields
                    const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
                    const localUser = localUsers[phone] || {};
                    
                    return {
                        ...users[userId],
                        ...localUser,
                        userId: userId
                    };
                }
            }
        }
        
        // Also check localStorage for pending users not yet synced
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        if (localUsers[phone]) {
            return localUsers[phone];
        }
        
        return null;
    } catch (error) {
        console.error("Error getting user via API:", error);
        // Fallback to localStorage
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        return localUsers[phone] || null;
    }
}

// Get user by referral code
async function getUserByReferralCode(referralCode) {
    if (!isOnline) throw new Error('No internet connection');
    try {
        const response = await fetch('/api/users');
        const result = await response.json();
        
        if (result.success && result.users) {
            const users = result.users;
            for (let userId in users) {
                // Check local storage for referral code
                const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
                const userWithRef = localUsers[users[userId].phone];
                if (userWithRef && userWithRef.referralCode === referralCode) {
                    return {
                        ...users[userId],
                        ...userWithRef,
                        userId: userId
                    };
                }
            }
        }
        
        // Check localStorage only
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        for (let phone in localUsers) {
            if (localUsers[phone].referralCode === referralCode) {
                return localUsers[phone];
            }
        }
        
        return null;
    } catch (error) {
        console.error("Error finding user by referral code:", error);
        return null;
    }
}

// Update user data
async function updateUser(phone, updates) {
    if (!isOnline) throw new Error('No internet connection');
    try {
        // Store updates in localStorage since backend doesn't have all these fields
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        if (localUsers[phone]) {
            localUsers[phone] = { ...localUsers[phone], ...updates };
            localStorage.setItem('users', JSON.stringify(localUsers));
        }
        return true;
    } catch (error) {
        console.error("Error updating user:", error);
        throw error;
    }
}

// Get all users
async function getAllUsers() {
    if (!isOnline) throw new Error('No internet connection');
    try {
        const response = await fetch('/api/users');
        const result = await response.json();
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        
        // Merge backend users with local data
        const allUsers = { ...localUsers };
        
        if (result.success && result.users) {
            for (let userId in result.users) {
                const user = result.users[userId];
                if (!allUsers[user.phone]) {
                    allUsers[user.phone] = user;
                } else {
                    allUsers[user.phone] = { ...allUsers[user.phone], ...user };
                }
            }
        }
        
        return allUsers;
    } catch (error) {
        console.error("Error getting all users:", error);
        return JSON.parse(localStorage.getItem('users') || '{}');
    }
}

// Add withdrawal request
async function addWithdrawalRequest(userPhone, amount) {
    if (!isOnline) throw new Error('No internet connection');
    try {
        const withdrawals = JSON.parse(localStorage.getItem('withdrawals') || '{}');
        const withdrawalKey = 'withdrawal_' + Date.now();
        withdrawals[withdrawalKey] = {
            userPhone: userPhone,
            amount: amount,
            timestamp: new Date().toISOString(),
            status: 'pending',
            userName: currentUser.name
        };
        localStorage.setItem('withdrawals', JSON.stringify(withdrawals));
        return true;
    } catch (error) {
        console.error("Error adding withdrawal request:", error);
        throw error;
    }
}

// Get withdrawal requests
async function getWithdrawalRequests() {
    if (!isOnline) throw new Error('No internet connection');
    try {
        return JSON.parse(localStorage.getItem('withdrawals') || '{}');
    } catch (error) {
        console.error("Error getting withdrawal requests:", error);
        return {};
    }
}

// Update withdrawal status
async function updateWithdrawalStatus(withdrawalKey, status) {
    if (!isOnline) throw new Error('No internet connection');
    try {
        const withdrawals = JSON.parse(localStorage.getItem('withdrawals') || '{}');
        if (withdrawals[withdrawalKey]) {
            withdrawals[withdrawalKey].status = status;
            withdrawals[withdrawalKey].processedAt = new Date().toISOString();
            localStorage.setItem('withdrawals', JSON.stringify(withdrawals));
        }
        return true;
    } catch (error) {
        console.error("Error updating withdrawal status:", error);
        throw error;
    }
}

// Add transaction
async function addTransaction(userPhone, type, amount, description) {
    try {
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        if (localUsers[userPhone]) {
            if (!localUsers[userPhone].transactions) {
                localUsers[userPhone].transactions = {};
            }
            const transactionKey = 'transaction_' + Date.now();
            localUsers[userPhone].transactions[transactionKey] = {
                type: type,
                amount: amount,
                description: description,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('users', JSON.stringify(localUsers));
        }
        return true;
    } catch (error) {
        console.error("Error adding transaction:", error);
        throw error;
    }
}

// UI Navigation Functions
function showInitialScreen() {
    hideAllScreens();
    const initialScreen = document.getElementById('initialScreen');
    if (initialScreen) initialScreen.classList.remove('hidden');
    clearFormFields();
}

function showLogin() {
    hideAllScreens();
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.classList.remove('hidden');
}

function showSignup() {
    hideAllScreens();
    const mainContainer = document.getElementById('mainContainer');
    if (mainContainer) mainContainer.classList.remove('hidden');
    showTab('noReferral');
}

function showAdminLogin() {
    hideAllScreens();
    const adminLogin = document.getElementById('adminLogin');
    if (adminLogin) adminLogin.classList.remove('hidden');
}

function hideAllScreens() {
    const screens = ['initialScreen', 'loginScreen', 'mainContainer', 'dashboard', 'adminLogin', 'adminPanel'];
    screens.forEach(screen => {
        const element = document.getElementById(screen);
        if (element) element.classList.add('hidden');
    });
}

function showAlert(message, type, screenId) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
   
    let alertContainer = document.getElementById(screenId + 'Alert');
    if (!alertContainer) {
        const screen = document.getElementById(screenId);
        if (screen) alertContainer = screen.querySelector('.form-container');
    }
   
    if (alertContainer) {
        const existingAlerts = alertContainer.querySelectorAll('.alert');
        existingAlerts.forEach(alert => alert.remove());
        alertContainer.insertBefore(alertDiv, alertContainer.firstChild);
       
        setTimeout(() => {
            if (alertDiv.parentNode) alertDiv.remove();
        }, 5000);
    }
}

function hideAlert(alertId) {
    const alert = document.getElementById(alertId);
    if (alert) alert.remove();
}

// Application Functions
function showTab(tabName) {
    const noRefForm = document.getElementById('noReferralForm');
    const hasRefForm = document.getElementById('hasReferralForm');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    if (noRefForm && hasRefForm) {
        noRefForm.classList.add('hidden');
        hasRefForm.classList.add('hidden');
        tabBtns.forEach(btn => btn.classList.remove('active'));

        if (tabName === 'noReferral') {
            noRefForm.classList.remove('hidden');
            if (tabBtns[0]) tabBtns[0].classList.add('active');
        } else {
            hasRefForm.classList.remove('hidden');
            if (tabBtns[1]) tabBtns[1].classList.add('active');
        }
    }
}

function showAdminTab(tabName) {
    const tabs = ['pendingUsers', 'referrals', 'withdrawals', 'users'];
    tabs.forEach(tab => {
        const tabElement = document.getElementById(tab + 'Tab');
        if (tabElement) tabElement.classList.add('hidden');
    });
    
    const adminTabs = document.querySelectorAll('.admin-tab');
    adminTabs.forEach(tab => tab.classList.remove('active'));

    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) selectedTab.classList.remove('hidden');
    
    if (event && event.target) event.target.classList.add('active');

    showProgress('adminPanelProgress', 'adminPanelProgressFill', 'adminPanelProgressText');
   
    if (tabName === 'pendingUsers') loadPendingUsersList();
    else if (tabName === 'referrals') loadUsersList();
    else if (tabName === 'withdrawals') loadWithdrawalsList();
    else if (tabName === 'users') loadAllUsersList();
   
    setTimeout(() => hideProgress('adminPanelProgress'), 1000);
}

function generateReferralCode(name) {
    const base = name.replace(/\s+/g, '').toUpperCase().substring(0, 4);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return base + random;
}

function validatePhone(phone) {
    const phoneRegex = /^[0-9]{10,15}$/;
    return phoneRegex.test(phone);
}

function validatePassword(password) {
    return password.length >= 6;
}

function validateName(name) {
    return name.length >= 2;
}

async function registerUser() {
    const name = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!validateName(name)) {
        showAlert('Please enter a valid name (at least 2 characters)', 'error', 'noRef');
        return;
    }
    if (!validatePhone(phone)) {
        showAlert('Please enter a valid phone number (10-15 digits)', 'error', 'noRef');
        return;
    }
    if (!validatePassword(password)) {
        showAlert('Password must be at least 6 characters long', 'error', 'noRef');
        return;
    }
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error', 'noRef');
        return;
    }

    showProgress('noRefProgress', 'noRefProgressFill', 'noRefProgressText');

    try {
        const existingUser = await getUserByPhone(phone);
        if (existingUser) {
            hideProgress('noRefProgress');
            showAlert('Phone number already registered', 'error', 'noRef');
            return;
        }

        const newUser = {
            name, 
            phone, 
            password,
            referralCode: '',
            earnings: 0,
            totalAllTimeEarnings: 0,
            referrals: {},
            joinDate: new Date().toISOString(),
            referredBy: null,
            transactions: {},
            status: 'pending'
        };

        const success = await registerUserToDatabase(newUser);
        if (success) {
            currentUser = newUser;
            completeProgress('noRefProgressFill', 'noRefProgressText', 'Account created!');
            setTimeout(() => {
                hideProgress('noRefProgress');
                showDashboard();
                showAlert('Account created successfully! Please wait for admin approval to get your referral code.', 'info', 'dashboard');
            }, 1000);
        }
    } catch (error) {
        console.error("Registration error:", error);
        hideProgress('noRefProgress');
        showAlert(error.message === 'No internet connection' ? 'No internet connection. Please check your connection.' : 'Error creating account. Please try again.', 'error', 'noRef');
    }
}

async function registerUserWithReferral() {
    const referralCode = document.getElementById('referralCodeInput').value.trim();
    const name = document.getElementById('refFullName').value.trim();
    const phone = document.getElementById('refPhone').value.trim();
    const password = document.getElementById('refPassword').value;
    const confirmPassword = document.getElementById('refConfirmPassword').value;

    if (!referralCode) {
        showAlert('Please enter a referral code', 'error', 'hasRef');
        return;
    }
    if (!validateName(name)) {
        showAlert('Please enter a valid name (at least 2 characters)', 'error', 'hasRef');
        return;
    }
    if (!validatePhone(phone)) {
        showAlert('Please enter a valid phone number (10-15 digits)', 'error', 'hasRef');
        return;
    }
    if (!validatePassword(password)) {
        showAlert('Password must be at least 6 characters long', 'error', 'hasRef');
        return;
    }
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error', 'hasRef');
        return;
    }

    showProgress('hasRefProgress', 'hasRefProgressFill', 'hasRefProgressText');

    try {
        const existingUser = await getUserByPhone(phone);
        if (existingUser) {
            hideProgress('hasRefProgress');
            showAlert('Phone number already registered', 'error', 'hasRef');
            return;
        }

        const referrer = await getUserByReferralCode(referralCode);
        if (!referrer) {
            hideProgress('hasRefProgress');
            showAlert('Invalid referral code', 'error', 'hasRef');
            return;
        }

        const newUser = {
            name, 
            phone, 
            password,
            referralCode: '',
            earnings: 0,
            totalAllTimeEarnings: 0,
            referrals: {},
            joinDate: new Date().toISOString(),
            referredBy: referrer.phone,
            transactions: {},
            status: 'pending'
        };

        const userSuccess = await registerUserToDatabase(newUser);
        if (!userSuccess) {
            hideProgress('hasRefProgress');
            showAlert('Error creating account. Please try again.', 'error', 'hasRef');
            return;
        }

        const referralKey = 'ref_' + Date.now();
        const newReferral = {
            phone: phone,
            name: name,
            joinDate: new Date().toISOString(),
            paid: false
        };

        const updateSuccess = await updateUser(referrer.phone, {
            [`referrals/${referralKey}`]: newReferral
        });

        if (updateSuccess) {
            currentUser = newUser;
            completeProgress('hasRefProgressFill', 'hasRefProgressText', 'Account created!');
            setTimeout(() => {
                hideProgress('hasRefProgress');
                showDashboard();
                showAlert(`Successfully joined using ${referrer.name}'s referral code! Please wait for admin approval.`, 'info', 'dashboard');
            }, 1000);
        } else {
            hideProgress('hasRefProgress');
            showAlert('Error updating referral. Please contact support.', 'error', 'hasRef');
        }
    } catch (error) {
        console.error("Registration error:", error);
        hideProgress('hasRefProgress');
        showAlert(error.message === 'No internet connection' ? 'No internet connection. Please check your connection.' : 'Error creating account. Please try again.', 'error', 'hasRef');
    }
}

async function loginUser() {
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!phone || !password) {
        showAlert('Please enter both phone and password', 'error', 'login');
        return;
    }

    showProgress('loginProgress', 'loginProgressFill', 'loginProgressText');

    try {
        const user = await getUserByPhone(phone);
        if (!user) {
            hideProgress('loginProgress');
            showAlert('User not found. Please check your phone number.', 'error', 'login');
            return;
        }
        if (user.password !== password) {
            hideProgress('loginProgress');
            showAlert('Incorrect password. Please try again.', 'error', 'login');
            return;
        }

        currentUser = user;
        completeProgress('loginProgressFill', 'loginProgressText', 'Login successful!');
        setTimeout(() => {
            hideProgress('loginProgress');
            showDashboard();
            showAlert('Login successful!', 'success', 'dashboard');
        }, 1000);
    } catch (error) {
        console.error("Login error:", error);
        hideProgress('loginProgress');
        showAlert(error.message === 'No internet connection' ? 'No internet connection. Please check your connection.' : 'Error logging in. Please try again.', 'error', 'login');
    }
}


async function showDashboard() {
    hideAllScreens();
    const dashboard = document.getElementById('dashboard');
    if (dashboard) dashboard.classList.remove('hidden');
    showProgress('dashboardProgress', 'dashboardProgressFill', 'dashboardProgressText');

    try {
        const userData = await getUserByPhone(currentUser.phone);
        if (userData) currentUser = userData;

        const greeting = document.getElementById('userGreeting');
        const userPhone = document.getElementById('userPhone');
        if (greeting) greeting.textContent = `Hello, ${currentUser.name}!`;
        if (userPhone) userPhone.textContent = currentUser.phone;
       
        const referralSection = document.getElementById('referralCodeSection');
        const waitingMessage = document.getElementById('waitingMessage');
        const userReferralCode = document.getElementById('userReferralCode');
        
        // ============================================
        // UPDATED: Handle pending users with payment button
        // ============================================
        if (currentUser.status === 'pending') {
            // Show waiting message with payment button
            if (waitingMessage) {
                waitingMessage.classList.remove('hidden');
                // Replace the waiting message content with payment option
                waitingMessage.innerHTML = `
                    <h3>💰 Get Your Referral Code</h3>
                    <p>To get your referral code and start earning, please pay 1500 RWF.</p>
                    <button onclick="requestPaymentForReferralCode('${currentUser.userId || currentUser.phone}', '${currentUser.phone}')" 
                            style="margin-top: 10px; padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold;">
                        💳 Pay 1500 RWF Now
                    </button>
                    <p class="time-info" style="margin-top: 10px;">Auto-approval within 5 minutes after payment</p>
                    <p class="time-info">Waiting since: ${new Date(currentUser.joinDate).toLocaleDateString()}</p>
                `;
            }
            if (referralSection) referralSection.classList.add('hidden');
        } 
        else if (currentUser.status === 'approved' && currentUser.referralCode) {
            // User is approved - show referral code
            if (referralSection) referralSection.classList.remove('hidden');
            if (waitingMessage) waitingMessage.classList.add('hidden');
            if (userReferralCode) userReferralCode.textContent = currentUser.referralCode;
        }
        else {
            // Fallback - hide both
            if (referralSection) referralSection.classList.add('hidden');
            if (waitingMessage) waitingMessage.classList.add('hidden');
        }
       
        // Calculate referral count and display earnings
        const referralCount = currentUser.referrals ? Object.keys(currentUser.referrals).length : 0;
        const totalEarnings = document.getElementById('totalEarnings');
        const availableBalance = document.getElementById('availableBalance');
        const totalAllTime = document.getElementById('totalAllTimeEarnings');
        const referralCountEl = document.getElementById('referralCount');
        
        if (referralCountEl) referralCountEl.textContent = referralCount;
        if (totalEarnings) totalEarnings.textContent = `${currentUser.earnings || 0} RWF`;
        if (availableBalance) availableBalance.textContent = `${currentUser.earnings || 0} RWF`;
        if (totalAllTime) totalAllTime.textContent = `${currentUser.totalAllTimeEarnings || 0} RWF`;

        // Load transaction history
        loadTransactionHistory();
       
        setTimeout(() => hideProgress('dashboardProgress'), 1000);
    } catch (error) {
        console.error("Error loading dashboard:", error);
        hideProgress('dashboardProgress');
        showAlert('Error loading dashboard data. Please try again.', 'error', 'dashboard');
    }
}

async function loadTransactionHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
   
    if (!currentUser.transactions) {
        historyList.innerHTML = '<p>No transaction history yet.</p>';
        return;
    }

    try {
        historyList.innerHTML = '';
        const transactions = currentUser.transactions;
        const sortedTransactions = Object.keys(transactions)
            .map(key => ({ key, ...transactions[key] }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
       
        if (sortedTransactions.length === 0) {
            historyList.innerHTML = '<p>No transaction history yet.</p>';
            return;
        }
       
        sortedTransactions.forEach(transaction => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            const typeText = transaction.type === 'earning' ? 'Earning' :
                           transaction.type === 'withdrawal' ? 'Withdrawal Request' :
                           transaction.type === 'withdrawal_processed' ? 'Withdrawal Processed' : 'Transaction';
            const sign = transaction.type.includes('earning') ? '+' : '-';
            
            historyItem.innerHTML = `
                <strong>${typeText}</strong><br>
                Amount: <span style="color: ${transaction.type.includes('earning') ? 'green' : 'red'}">${sign}${transaction.amount} RWF</span><br>
                Description: ${transaction.description}<br>
                Date: ${new Date(transaction.timestamp).toLocaleString()}
            `;
            historyList.appendChild(historyItem);
        });
    } catch (error) {
        console.error("Error loading transaction history:", error);
        historyList.innerHTML = '<p>Error loading transaction history.</p>';
    }
}

async function requestWithdrawal() {
    const amountInput = document.getElementById('withdrawAmount');
    const amount = parseInt(amountInput ? amountInput.value : '0');
   
    if (!amount || amount <= 0) {
        showAlert('Please enter a valid withdrawal amount', 'error', 'dashboard');
        return;
    }
    if (amount > currentUser.earnings) {
        showAlert('Insufficient balance for this withdrawal', 'error', 'dashboard');
        return;
    }
   
    try {
        const success = await addWithdrawalRequest(currentUser.phone, amount);
        if (success) {
            await addTransaction(currentUser.phone, 'withdrawal', amount, 'Withdrawal request submitted');
            const newEarnings = currentUser.earnings - amount;
            await updateUser(currentUser.phone, { earnings: newEarnings });
           
            currentUser.earnings = newEarnings;
            const totalEarnings = document.getElementById('totalEarnings');
            const availableBalance = document.getElementById('availableBalance');
            if (totalEarnings) totalEarnings.textContent = `${currentUser.earnings} RWF`;
            if (availableBalance) availableBalance.textContent = `${currentUser.earnings} RWF`;
            if (amountInput) amountInput.value = '';
           
            showAlert('Withdrawal request submitted successfully!', 'success', 'dashboard');
            loadTransactionHistory();
        }
    } catch (error) {
        console.error("Withdrawal error:", error);
        showAlert(error.message === 'No internet connection' ? 'No internet connection. Please check your connection.' : 'Error submitting withdrawal request. Please try again.', 'error', 'dashboard');
    }
}

async function sendContactMessage() {
    const messageInput = document.getElementById('contactMessage');
    const message = messageInput ? messageInput.value.trim() : '';
   
    if (!message) {
        showAlert('Please enter a message', 'error', 'dashboard');
        return;
    }
   
    try {
        showAlert('Message sent successfully! We will respond as soon as possible.', 'success', 'dashboard');
        if (messageInput) messageInput.value = '';
       
        const contacts = JSON.parse(localStorage.getItem('contacts') || '{}');
        const contactKey = 'contact_' + Date.now();
        contacts[contactKey] = {
            userPhone: currentUser.phone,
            userName: currentUser.name,
            message: message,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('contacts', JSON.stringify(contacts));
    } catch (error) {
        console.error("Contact message error:", error);
        showAlert('Error sending message. Please try again.', 'error', 'dashboard');
    }
}

async function loginAdmin() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput ? passwordInput.value : '';
   
    if (!password) {
        showAlert('Please enter admin password', 'error', 'admin');
        return;
    }
   
    showProgress('adminProgress', 'adminProgressFill', 'adminProgressText');
    
    try {
        // Call the backend API instead of checking locally
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Login successful
            completeProgress('adminProgressFill', 'adminProgressText', 'Login successful!');
            setTimeout(() => {
                hideProgress('adminProgress');
                const adminLogin = document.getElementById('adminLogin');
                const adminPanel = document.getElementById('adminPanel');
                if (adminLogin) adminLogin.classList.add('hidden');
                if (adminPanel) adminPanel.classList.remove('hidden');
                loadPendingUsersList();
                showAlert('Admin login successful!', 'success', 'adminPanel');
            }, 1000);
        } else {
            // Login failed
            hideProgress('adminProgress');
            showAlert(result.error || 'Invalid admin password', 'error', 'admin');
        }
    } catch (error) {
        console.error('Admin login error:', error);
        hideProgress('adminProgress');
        showAlert('Error connecting to server. Please try again.', 'error', 'admin');
    }
}

async function loadPendingUsersList() {
    const pendingUsersList = document.getElementById('pendingUsersList');
    if (!pendingUsersList) return;
    
    pendingUsersList.innerHTML = '<div class="loading">Loading pending users...</div>';

    try {
        const users = await getAllUsers();
        pendingUsersList.innerHTML = '';
        let hasPendingUsers = false;

        for (let phone in users) {
            const user = users[phone];
            if (user.status === 'pending') {
                hasPendingUsers = true;
                const waitingTime = calculateWaitingTime(user.joinDate);
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.innerHTML = `
                    <strong>${user.name}</strong><br>
                    Phone: ${user.phone}<br>
                    Join Date: ${new Date(user.joinDate).toLocaleDateString()}<br>
                    <div class="time-info">Waiting for: ${waitingTime}</div>
                    <button onclick="window.approveUser('${user.phone}')" style="margin-top: 10px; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">Approve & Generate Referral Code</button>
                `;
                pendingUsersList.appendChild(userItem);
            }
        }
        if (!hasPendingUsers) pendingUsersList.innerHTML = '<p>No users waiting for approval.</p>';
    } catch (error) {
        console.error("Error loading pending users:", error);
        pendingUsersList.innerHTML = '<p>Error loading pending users. Please try again.</p>';
    }
}

async function loadUsersList() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    usersList.innerHTML = '<div class="loading">Loading referrals...</div>';

    try {
        const users = await getAllUsers();
        usersList.innerHTML = '';
        let hasPendingReferrals = false;

        for (let phone in users) {
            const user = users[phone];
            if (user.referrals) {
                for (let refKey in user.referrals) {
                    const referral = user.referrals[refKey];
                    if (!referral.paid) {
                        hasPendingReferrals = true;
                        const userItem = document.createElement('div');
                        userItem.className = 'user-item';
                        userItem.innerHTML = `
                            <strong>${referral.name}</strong><br>
                            Phone: ${referral.phone}<br>
                            Referred by: ${user.name} (${user.phone})<br>
                            Join Date: ${new Date(referral.joinDate).toLocaleDateString()}<br>
                            <button onclick="window.markAsPaid('${user.phone}', '${refKey}')" style="margin-top: 10px; padding: 5px 10px; background: #4facfe; color: white; border: none; border-radius: 5px; cursor: pointer;">Mark as Paid</button>
                        `;
                        usersList.appendChild(userItem);
                    }
                }
            }
        }
        if (!hasPendingReferrals) usersList.innerHTML = '<p>No pending referrals requiring payment.</p>';
    } catch (error) {
        console.error("Error loading referrals:", error);
        usersList.innerHTML = '<p>Error loading referrals. Please try again.</p>';
    }
}

async function loadWithdrawalsList() {
    const withdrawalsList = document.getElementById('withdrawalsList');
    if (!withdrawalsList) return;
    
    withdrawalsList.innerHTML = '<div class="loading">Loading withdrawal requests...</div>';

    try {
        const withdrawals = await getWithdrawalRequests();
        withdrawalsList.innerHTML = '';
        let hasPendingWithdrawals = false;

        for (let key in withdrawals) {
            const withdrawal = withdrawals[key];
            if (withdrawal.status === 'pending') {
                hasPendingWithdrawals = true;
                const withdrawalItem = document.createElement('div');
                withdrawalItem.className = 'user-item';
                withdrawalItem.innerHTML = `
                    <strong>${withdrawal.userName}</strong><br>
                    Phone: ${withdrawal.userPhone}<br>
                    Amount: ${withdrawal.amount} RWF<br>
                    Request Date: ${new Date(withdrawal.timestamp).toLocaleString()}<br>
                    <button onclick="window.processWithdrawal('${key}', 'approved')" style="margin-top: 10px; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 5px;">Approve</button>
                    <button onclick="window.processWithdrawal('${key}', 'rejected')" style="margin-top: 10px; padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">Reject</button>
                `;
                withdrawalsList.appendChild(withdrawalItem);
            }
        }
        if (!hasPendingWithdrawals) withdrawalsList.innerHTML = '<p>No pending withdrawal requests.</p>';
    } catch (error) {
        console.error("Error loading withdrawals:", error);
        withdrawalsList.innerHTML = '<p>Error loading withdrawal requests. Please try again.</p>';
    }
}

async function loadAllUsersList() {
    const allUsersList = document.getElementById('allUsersList');
    if (!allUsersList) return;
    
    allUsersList.innerHTML = '<div class="loading">Loading all users...</div>';

    try {
        const users = await getAllUsers();
        allUsersList.innerHTML = '';

        if (Object.keys(users).length === 0) {
            allUsersList.innerHTML = '<p>No users found.</p>';
            return;
        }

        for (let phone in users) {
            const user = users[phone];
            const referralCount = user.referrals ? Object.keys(user.referrals).length : 0;
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.innerHTML = `
                <strong>${user.name}</strong><br>
                Phone: ${user.phone}<br>
                Status: ${user.status || 'approved'}<br>
                Referral Code: ${user.referralCode || 'Pending'}<br>
                Earnings: ${user.earnings || 0} RWF<br>
                Total All-Time: ${user.totalAllTimeEarnings || 0} RWF<br>
                Referrals: ${referralCount}<br>
                Join Date: ${new Date(user.joinDate).toLocaleDateString()}
            `;
            allUsersList.appendChild(userItem);
        }
    } catch (error) {
        console.error("Error loading all users:", error);
        allUsersList.innerHTML = '<p>Error loading users. Please try again.</p>';
    }
}

async function approveUser(userPhone) {
    try {
        const user = await getUserByPhone(userPhone);
        if (!user) {
            showAlert('User not found', 'error', 'adminPanel');
            return;
        }
        const referralCode = generateReferralCode(user.name);
        await updateUser(userPhone, { referralCode: referralCode, status: 'approved' });
        loadPendingUsersList();
        showAlert(`User ${user.name} approved successfully! Referral code: ${referralCode}`, 'success', 'adminPanel');
    } catch (error) {
        console.error("Error approving user:", error);
        showAlert('Error approving user. Please try again.', 'error', 'adminPanel');
    }
}

async function markAsPaid(referrerPhone, referralKey) {
    try {
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        if (localUsers[referrerPhone] && localUsers[referrerPhone].referrals && localUsers[referrerPhone].referrals[referralKey]) {
            localUsers[referrerPhone].referrals[referralKey].paid = true;
            const newEarnings = (localUsers[referrerPhone].earnings || 0) + 1500;
            const newTotalEarnings = (localUsers[referrerPhone].totalAllTimeEarnings || 0) + 1500;
            localUsers[referrerPhone].earnings = newEarnings;
            localUsers[referrerPhone].totalAllTimeEarnings = newTotalEarnings;
            localStorage.setItem('users', JSON.stringify(localUsers));
            
            await addTransaction(referrerPhone, 'earning', 1500, 'Referral bonus for ' + localUsers[referrerPhone].referrals[referralKey].name);
            
            // Update current user if it's the same
            if (currentUser && currentUser.phone === referrerPhone) {
                currentUser.earnings = newEarnings;
                currentUser.totalAllTimeEarnings = newTotalEarnings;
            }
        }
        loadUsersList();
        showAlert(`Marked referral as paid. User earned 1500 RWF.`, 'success', 'adminPanel');
    } catch (error) {
        console.error("Error marking as paid:", error);
        showAlert('Error updating payment status. Please try again.', 'error', 'adminPanel');
    }
}

async function processWithdrawal(withdrawalKey, status) {
    try {
        await updateWithdrawalStatus(withdrawalKey, status);
        if (status === 'approved') {
            const withdrawals = await getWithdrawalRequests();
            const withdrawal = withdrawals[withdrawalKey];
            await addTransaction(withdrawal.userPhone, 'withdrawal_processed', withdrawal.amount, 'Withdrawal processed');
        }
        loadWithdrawalsList();
        showAlert(`Withdrawal ${status} successfully.`, 'success', 'adminPanel');
    } catch (error) {
        console.error("Error processing withdrawal:", error);
        showAlert('Error processing withdrawal. Please try again.', 'error', 'adminPanel');
    }
}

// Add these new functions to app.js (around line 900, before logout function)

// Request payment for referral code
async function requestPaymentForReferralCode(userId, phone) {
    showProgress('dashboardProgress', 'dashboardProgressFill', 'dashboardProgressText');
    
    try {
        const response = await fetch('/api/payments/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId, phone, amount: 1500 })
        });
        
        const result = await response.json();
        
        if (result.alreadyApproved) {
            hideProgress('dashboardProgress');
            showAlert(`Your referral code is: ${result.referralCode}`, 'success', 'dashboard');
            showDashboard(); // Refresh dashboard
            return;
        }
        
        hideProgress('dashboardProgress');
        
        if (result.manualPayment) {
            // Show manual payment instructions
            showAlert(
                `${result.message}\n\nAfter sending money, your referral code will be auto-approved within 5 minutes.`, 
                'info', 
                'dashboard'
            );
            
            // Start checking for approval
            startCheckingApprovalStatus(userId);
        } else if (result.paymentUrl) {
            // Redirect to payment page
            window.open(result.paymentUrl, '_blank');
            showAlert('Complete payment on your phone. This page will auto-refresh.', 'info', 'dashboard');
            startCheckingApprovalStatus(userId);
        }
        
    } catch (error) {
        console.error('Payment request error:', error);
        hideProgress('dashboardProgress');
        showAlert('Error requesting payment. Please contact support.', 'error', 'dashboard');
    }
}

// Poll for approval status
function startCheckingApprovalStatus(userId) {
    let attempts = 0;
    const maxAttempts = 60; // Check for 5 minutes (every 5 seconds)
    
    const interval = setInterval(async () => {
        attempts++;
        
        try {
            // Refresh user data
            const freshUser = await getUserByPhone(currentUser.phone);
            
            if (freshUser && freshUser.status === 'approved' && freshUser.referralCode) {
                clearInterval(interval);
                currentUser = freshUser;
                showAlert(`✅ Payment verified! Your referral code is: ${freshUser.referralCode}`, 'success', 'dashboard');
                showDashboard(); // Refresh dashboard
                return;
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                showAlert('Payment verification taking longer than expected. Please contact support.', 'warning', 'dashboard');
            }
            
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 5000); // Check every 5 seconds
}

function logout() {
    currentUser = null;
    const dashboard = document.getElementById('dashboard');
    const initialScreen = document.getElementById('initialScreen');
    if (dashboard) dashboard.classList.add('hidden');
    if (initialScreen) initialScreen.classList.remove('hidden');
    clearFormFields();
}

function logoutAdmin() {
    const adminPanel = document.getElementById('adminPanel');
    const initialScreen = document.getElementById('initialScreen');
    const adminPassword = document.getElementById('adminPassword');
    if (adminPanel) adminPanel.classList.add('hidden');
    if (initialScreen) initialScreen.classList.remove('hidden');
    if (adminPassword) adminPassword.value = '';
}

function clearFormFields() {
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => { input.value = ''; });
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => alert.remove());
    
    const passwordStrength = document.getElementById('passwordStrength');
    const refPasswordStrength = document.getElementById('refPasswordStrength');
    const passwordFeedback = document.getElementById('passwordFeedback');
    const refPasswordFeedback = document.getElementById('refPasswordFeedback');
    
    if (passwordStrength) {
        passwordStrength.className = 'password-strength';
        passwordStrength.style.width = '0%';
    }
    if (refPasswordStrength) {
        refPasswordStrength.className = 'password-strength';
        refPasswordStrength.style.width = '0%';
    }
    if (passwordFeedback) passwordFeedback.textContent = '';
    if (refPasswordFeedback) refPasswordFeedback.textContent = '';
}

// Make functions globally available
window.showTab = showTab;
window.showAdminTab = showAdminTab;
window.registerUser = registerUser;
window.registerUserWithReferral = registerUserWithReferral;
window.loginUser = loginUser;
window.showInitialScreen = showInitialScreen;
window.showLogin = showLogin;
window.showSignup = showSignup;
window.showAdminLogin = showAdminLogin;
window.loginAdmin = loginAdmin;
window.logout = logout;
window.logoutAdmin = logoutAdmin;
window.markAsPaid = markAsPaid;
window.processWithdrawal = processWithdrawal;
window.requestWithdrawal = requestWithdrawal;
window.sendContactMessage = sendContactMessage;
window.approveUser = approveUser;
window.togglePassword = togglePassword;
window.checkPasswordStrength = checkPasswordStrength;
window.checkPasswordStrengthRef = checkPasswordStrengthRef;
window.requestPaymentForReferralCode = requestPaymentForReferralCode;

// Initialize
showInitialScreen();

console.log('✅ App initialized - Using backend API for data storage');
