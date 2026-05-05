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
        
        if (!response.ok) {
            hideProgress('dashboardProgress');
            showAlert(result.error || 'Payment request failed', 'error', 'dashboard');
            return;
        }
        
        if (result.alreadyApproved) {
            hideProgress('dashboardProgress');
            showAlert(`✅ Your referral code is: ${result.referralCode}`, 'success', 'dashboard');
            showDashboard();
            return;
        }
        
        hideProgress('dashboardProgress');
        
        if (result.manualPayment) {
            // Show payment instructions
            const paymentMessage = `
                💳 Payment Required: ${result.amount} RWF\n\n
                📱 Send to: ${result.merchantPhone} (${result.merchantName})\n
                🔑 Reference: ${result.paymentRef}\n\n
                After sending money, your account will be auto-approved within 5 minutes.\n
                Contact support if you don't receive your code.
            `;
            
            showAlert(paymentMessage, 'info', 'dashboard');
            
            // Show a more detailed modal/alert with copy button
            const modalHtml = `
                <div id="paymentModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;">
                    <div style="background: white; border-radius: 20px; padding: 25px; max-width: 90%; width: 350px; text-align: center;">
                        <h3 style="color: #333; margin-bottom: 15px;">💳 Complete Payment</h3>
                        <p style="margin-bottom: 10px;">Send <strong style="color: #28a745; font-size: 24px;">${result.amount} RWF</strong> to:</p>
                        <div style="background: #f0f0f0; padding: 15px; border-radius: 10px; margin: 15px 0;">
                            <p style="font-size: 18px; font-weight: bold;">${result.merchantPhone}</p>
                            <p style="color: #666;">${result.merchantName}</p>
                        </div>
                        <p style="margin-bottom: 10px;">Use reference:</p>
                        <div style="background: #e3f2fd; padding: 10px; border-radius: 8px; margin: 10px 0;">
                            <code style="font-size: 14px; word-break: break-all;">${result.paymentRef}</code>
                            <button onclick="navigator.clipboard.writeText('${result.paymentRef}')" style="margin-left: 10px; padding: 5px 10px; background: #4facfe; color: white; border: none; border-radius: 5px; cursor: pointer;">Copy</button>
                        </div>
                        <p style="font-size: 12px; color: #666; margin-top: 10px;">✅ Auto-approval within 5 minutes after payment</p>
                        <button onclick="document.getElementById('paymentModal').remove()" style="margin-top: 15px; padding: 10px 20px; background: #4facfe; color: white; border: none; border-radius: 10px; cursor: pointer;">OK, I'll Pay</button>
                    </div>
                </div>
            `;
            
            // Remove existing modal if any
            const existingModal = document.getElementById('paymentModal');
            if (existingModal) existingModal.remove();
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Start checking for approval
            startCheckingApprovalStatus(userId);
        } else if (result.paymentUrl) {
            // Automatic payment redirect
            window.open(result.paymentUrl, '_blank');
            showAlert('Complete payment on your phone. This page will auto-refresh when approved.', 'info', 'dashboard');
            startCheckingApprovalStatus(userId);
        }
        
    } catch (error) {
        console.error('Payment request error:', error);
        hideProgress('dashboardProgress');
        showAlert('Error requesting payment. Please check your internet connection and try again.', 'error', 'dashboard');
    }
}

// Poll for approval status
function startCheckingApprovalStatus(userId) {
    let attempts = 0;
    const maxAttempts = 60; // Check for 5 minutes (every 5 seconds)
    
    const interval = setInterval(async () => {
        attempts++;
        
        try {
            // Check status via API
            const response = await fetch(`/api/payments/status/${userId}`);
            const result = await response.json();
            
            if (result.status === 'approved' && result.referralCode) {
                clearInterval(interval);
                
                // Refresh user data
                const freshUser = await getUserByPhone(currentUser.phone);
                if (freshUser) {
                    currentUser = freshUser;
                }
                
                // Remove modal if exists
                const modal = document.getElementById('paymentModal');
                if (modal) modal.remove();
                
                showAlert(`✅ Payment verified! Your referral code is: ${result.referralCode}`, 'success', 'dashboard');
                showDashboard();
                return;
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                showAlert('⏳ Payment verification taking longer than expected. Please contact support with your payment reference.', 'warning', 'dashboard');
            }
            
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 5000);
}
