// KisanAgri Application State & Logic Controller

let products = [];
let customers = [];
let orders = [];
let notifications = [];
let cart = []; // [{ productId, qty }]
let currentRole = 'customer'; // 'customer' or 'owner'
let currentLang = 'en'; // 'en' or 'ta'
let loggedInCustomerIndex = 0; // Privacy locked index for Customer View
let selectedPayMethod = 'UPI';
let tempUploadedImageBase64 = ''; // Base64 data URL of direct uploaded chemical image file
let tempEditImageBase64 = '';

let currentAuthRole = 'customer'; // 'customer' or 'admin'

// Helper for i18n translation key
function t(key) {
  const dict = translations[currentLang] || translations.en;
  return dict[key] || translations.en[key] || key;
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  applyLanguageUI();
  applyAuthAccessRules();
  renderAll();
  checkInitialWelcomeAuth();
  restoreSavedTabLocation();
  checkCookieConsent();

  // Attach focus listeners to auth screen inputs to strip readonly on click/focus and prevent browser native autofill history popups
  document.querySelectorAll('#authFullPageScreen input').forEach(input => {
    input.setAttribute('autocomplete', 'one-time-code');
    input.addEventListener('focus', function() {
      this.removeAttribute('readonly');
    });
    input.addEventListener('click', function() {
      this.removeAttribute('readonly');
    });
  });
});

window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('kisan_scroll_pos', window.scrollY);
});

function restoreSavedTabLocation() {
  const savedTopTab = sessionStorage.getItem('kisan_active_top_tab') || localStorage.getItem('kisan_active_top_tab');
  const savedSubTab = sessionStorage.getItem('kisan_active_crud_sub_tab') || localStorage.getItem('kisan_active_crud_sub_tab');

  if (savedTopTab) {
    if (savedTopTab === 'tabOwner' && currentAuthRole !== 'admin') {
      setActiveTab('tabStock');
    } else {
      const targetBtn = document.querySelector(`.tab-btn[data-tab="${savedTopTab}"]`);
      if (targetBtn) {
        setActiveTab(savedTopTab);
      }
    }
  }

  if (savedSubTab) {
    switchCrudSubTab(savedSubTab);
  }

  const savedScroll = sessionStorage.getItem('kisan_scroll_pos');
  if (savedScroll !== null) {
    setTimeout(() => {
      window.scrollTo(0, parseInt(savedScroll, 10));
    }, 100);
  }
}

function loadData() {
  try {
    const savedProducts = localStorage.getItem('kisan_products');
    const savedCustomers = localStorage.getItem('kisan_customers');
    const savedOrders = localStorage.getItem('kisan_orders');
    const savedNotifs = localStorage.getItem('kisan_notifs');
    const savedLang = localStorage.getItem('kisan_lang');

    const parsedProducts = savedProducts ? JSON.parse(savedProducts) : null;
    const parsedCustomers = savedCustomers ? JSON.parse(savedCustomers) : null;
    const parsedOrders = savedOrders ? JSON.parse(savedOrders) : null;
    const parsedNotifs = savedNotifs ? JSON.parse(savedNotifs) : null;

    products = (Array.isArray(parsedProducts) && parsedProducts.length > 0) ? parsedProducts : [...initialProducts];
    products.forEach(p => {
      if (p.id === 'PROD-001' && (!p.imageUrl || !p.imageUrl.startsWith('assets/'))) {
        p.imageUrl = 'assets/iffco_urea.jpg';
      } else if (p.id === 'PROD-002' && (!p.imageUrl || !p.imageUrl.startsWith('assets/'))) {
        p.imageUrl = 'assets/coromandel_gromor.jpg';
      } else if (p.id === 'PROD-004' && (!p.imageUrl || !p.imageUrl.startsWith('assets/'))) {
        p.imageUrl = 'assets/agrochemical_bottle.jpg';
      }
    });
    customers = (Array.isArray(parsedCustomers) && parsedCustomers.length > 0 && parsedCustomers[0].purchases) ? parsedCustomers : [...initialCustomers];
    orders = (Array.isArray(parsedOrders) && parsedOrders.length > 0) ? parsedOrders : [...initialOrders];
    notifications = (Array.isArray(parsedNotifs) && parsedNotifs.length > 0) ? parsedNotifs : [...initialNotifications];
    currentLang = savedLang ? savedLang : 'en';

    saveData();
  } catch (err) {
    console.error("Resetting seed data due to storage parse error:", err);
    products = [...initialProducts];
    customers = [...initialCustomers];
    orders = [...initialOrders];
    notifications = [...initialNotifications];
    currentLang = 'en';
    saveData();
  }

  const sessionCustIdx = sessionStorage.getItem('kisan_active_cust_idx') !== null ? sessionStorage.getItem('kisan_active_cust_idx') : localStorage.getItem('kisan_active_cust_idx');
  const sessionAuthRole = sessionStorage.getItem('kisan_auth_role') || localStorage.getItem('kisan_auth_role');

  loggedInCustomerIndex = sessionCustIdx !== null ? parseInt(sessionCustIdx, 10) : 0;
  currentAuthRole = sessionAuthRole ? sessionAuthRole : 'customer';

  if (isNaN(loggedInCustomerIndex) || loggedInCustomerIndex < 0 || loggedInCustomerIndex >= customers.length) {
    loggedInCustomerIndex = 0;
  }
}

function saveData() {
  localStorage.setItem('kisan_products', JSON.stringify(products));
  localStorage.setItem('kisan_customers', JSON.stringify(customers));
  localStorage.setItem('kisan_orders', JSON.stringify(orders));
  localStorage.setItem('kisan_notifs', JSON.stringify(notifications));
  localStorage.setItem('kisan_lang', currentLang);

  // Tab-isolated session storage so multiple tabs can run different roles/accounts concurrently without glitching
  sessionStorage.setItem('kisan_active_cust_idx', loggedInCustomerIndex);
  sessionStorage.setItem('kisan_auth_role', currentAuthRole);
  localStorage.setItem('kisan_active_cust_idx', loggedInCustomerIndex);
  localStorage.setItem('kisan_auth_role', currentAuthRole);
}

// Real-time synchronization across simultaneous open browser tabs/windows (Customer <-> Admin View)
window.addEventListener('storage', (e) => {
  if (['kisan_products', 'kisan_customers', 'kisan_orders', 'kisan_notifs'].includes(e.key)) {
    const savedProducts = localStorage.getItem('kisan_products');
    const savedCustomers = localStorage.getItem('kisan_customers');
    const savedOrders = localStorage.getItem('kisan_orders');
    const savedNotifs = localStorage.getItem('kisan_notifs');

    if (savedProducts) products = JSON.parse(savedProducts);
    if (savedCustomers) customers = JSON.parse(savedCustomers);
    if (savedOrders) orders = JSON.parse(savedOrders);
    if (savedNotifs) notifications = JSON.parse(savedNotifs);

    renderAll();
  }
});

// ----------------------------------------------------
// Access Control Rules: Customer View vs Admin View
// ----------------------------------------------------
function applyAuthAccessRules() {
  const adminSwitcher = document.getElementById('adminRoleSwitcherContainer');
  const stockTabBtn = document.getElementById('tabStockBtn');
  const ordersTabBtn = document.getElementById('tabOrdersBtn');
  const ledgerTabBtn = document.getElementById('tabLedgerBtn');
  const ownerTabBtn = document.getElementById('tabOwnerBtn');
  const cartBtn = document.getElementById('cartBtn');
  const badgeEl = document.getElementById('activeProfileBadge');

  const authBtnIcon = document.getElementById('switchProfileBtnIcon');
  const authBtnText = document.getElementById('switchProfileBtnText');

  if (currentAuthRole === 'admin') {
    // Admin login: Hide Cart button & Customer tabs, show ONLY Shop Owner Control Center
    currentRole = 'owner';
    if (cartBtn) cartBtn.style.display = 'none';
    if (adminSwitcher) adminSwitcher.style.display = 'none';
    if (stockTabBtn) stockTabBtn.style.display = 'none';
    if (ordersTabBtn) ordersTabBtn.style.display = 'none';
    if (ledgerTabBtn) ledgerTabBtn.style.display = 'none';
    if (ownerTabBtn) ownerTabBtn.style.display = 'inline-flex';

    if (authBtnIcon) authBtnIcon.textContent = '';
    if (authBtnText) authBtnText.textContent = currentLang === 'ta' ? 'கணக்கை மாற்று' : 'Switch Account';

    const activeTab = document.querySelector('.tab-btn.active');
    if (!activeTab || activeTab.dataset.tab !== 'tabOwner') {
      setActiveTab('tabOwner');
    }

    if (badgeEl) {
      badgeEl.innerHTML = ` <strong>Admin</strong>`;
      badgeEl.style.background = '#fef2f2';
      badgeEl.style.color = '#991b1b';
      badgeEl.style.borderColor = '#fca5a5';
    }
  } else {
    // Customer login: Show Cart button & Customer tabs, hide Shop Owner Control Center & role switcher
    currentRole = 'customer';
    if (cartBtn) cartBtn.style.display = 'inline-flex';
    if (adminSwitcher) adminSwitcher.style.display = 'none';
    if (stockTabBtn) stockTabBtn.style.display = 'inline-flex';
    if (ordersTabBtn) ordersTabBtn.style.display = 'inline-flex';
    if (ledgerTabBtn) ledgerTabBtn.style.display = 'inline-flex';
    if (ownerTabBtn) ownerTabBtn.style.display = 'none';

    if (authBtnIcon) authBtnIcon.textContent = '';
    if (authBtnText) authBtnText.textContent = currentLang === 'ta' ? 'வெளியேறு' : 'Log Out';

    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'tabOwner') {
      setActiveTab('tabStock');
    }

    const activeCust = customers[loggedInCustomerIndex];
    if (badgeEl && activeCust) {
      const cName = (currentLang === 'ta' && activeCust.nameTa) ? activeCust.nameTa : activeCust.name;
      badgeEl.innerHTML = `<strong>${cName}</strong> (${activeCust.phone})`;
      badgeEl.style.background = 'var(--primary-light)';
      badgeEl.style.color = 'var(--primary-color)';
      badgeEl.style.borderColor = '#a7f3d0';
    }
  }

  applyLanguageUI();
}

function handleHeaderAuthAction() {
  if (currentAuthRole === 'customer') {
    openLogoutConfirmModal();
  } else {
    openLoginModal();
  }
}

function openLogoutConfirmModal() {
  const titleEl = document.getElementById('logoutConfirmTitle');
  const textEl = document.getElementById('logoutConfirmText');
  const yesBtn = document.getElementById('logoutConfirmYesBtn');
  const noBtn = document.getElementById('logoutConfirmNoBtn');

  if (titleEl) titleEl.textContent = currentLang === 'ta' ? 'வெளியேறு உறுதிப்படுத்தல்' : 'Log Out Confirmation';
  if (textEl) textEl.textContent = currentLang === 'ta' ? 'நீங்கள் நிச்சயமாக வெளியேற விரும்புகிறீர்களா?' : 'Are you sure want to Log Out?';
  if (yesBtn) yesBtn.textContent = currentLang === 'ta' ? 'ஆம்' : 'Yes';
  if (noBtn) noBtn.textContent = currentLang === 'ta' ? 'இல்லை' : 'No';

  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.add('active');
}

function closeLogoutConfirmModal() {
  const modal = document.getElementById('logoutConfirmModal');
  if (modal) modal.classList.remove('active');
}

function confirmCustomerLogout() {
  closeLogoutConfirmModal();

  localStorage.removeItem('kisan_has_authenticated');
  sessionStorage.removeItem('kisan_active_cust_idx');
  localStorage.removeItem('kisan_active_cust_idx');

  loggedInCustomerIndex = 0;
  currentAuthRole = 'customer';
  sessionStorage.setItem('kisan_auth_role', 'customer');
  localStorage.setItem('kisan_auth_role', 'customer');

  applyAuthAccessRules();
  renderAll();

  openLoginModal();

  showToast(
    currentLang === 'ta' ? 'வெளியேறப்பட்டது' : 'Logged Out',
    currentLang === 'ta' ? 'நீங்கள் வெற்றிகரமாக வெளியேறிவிட்டீர்கள்.' : 'You have logged out successfully.',
    ''
  );
}

// ----------------------------------------------------
// Initial Welcome Authentication (Show Login/Register First)
// ----------------------------------------------------
function checkInitialWelcomeAuth() {
  const hasAuth = localStorage.getItem('kisan_has_authenticated');
  if (!hasAuth) {
    openLoginModal();
  } else {
    closeLoginModal();
  }
}

function openLoginModal() {
  switchAuthTab('signin');
  const mainApp = document.getElementById('mainAppContainer');
  const authScreen = document.getElementById('authFullPageScreen');

  if (mainApp) mainApp.style.display = 'none';
  if (authScreen) {
    authScreen.style.display = 'flex';
  }

  // Strictly clear all authentication and registration input fields for privacy & security
  const authInputIds = ['signInPhoneInput', 'signInPinInput', 'regNameInput', 'regPhoneInput', 'regVillageInput', 'regPinInput', 'regConfirmPinInput', 'adminPasscodeInput'];
  authInputIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.setAttribute('readonly', 'readonly');
      el.setAttribute('autocomplete', 'one-time-code');
    }
  });
}

function closeLoginModal() {
  const mainApp = document.getElementById('mainAppContainer');
  const authScreen = document.getElementById('authFullPageScreen');

  if (authScreen) authScreen.style.display = 'none';
  if (mainApp) mainApp.style.display = 'block';
}

function switchAuthTab(tab) {
  const signInView = document.getElementById('authSignInView');
  const registerView = document.getElementById('authRegisterView');
  const adminView = document.getElementById('authAdminView');

  const signInBtn = document.getElementById('authTabSignInBtn');
  const registerBtn = document.getElementById('authTabRegisterBtn');
  const adminBtn = document.getElementById('authTabAdminBtn');

  if (signInView) signInView.style.display = tab === 'signin' ? 'block' : 'none';
  if (registerView) registerView.style.display = tab === 'register' ? 'block' : 'none';
  if (adminView) adminView.style.display = tab === 'admin' ? 'block' : 'none';

  if (signInBtn) signInBtn.classList.toggle('active', tab === 'signin');
  if (registerBtn) registerBtn.classList.toggle('active', tab === 'register');
  if (adminBtn) adminBtn.classList.toggle('active', tab === 'admin');
}

// Validation Helpers
function validateLettersOnly(str) {
  // Allows letters (English & Tamil Unicode range), spaces, dots, hyphens
  const regex = /^[A-Za-z\u0B80-\u0BFF\s\.-]+$/;
  return regex.test(str);
}

function validatePhone10Digits(phone) {
  // Exactly 10 numeric digits, no less and no more
  const regex = /^[0-9]{10}$/;
  return regex.test(phone);
}

function validatePin4Digits(pin) {
  // Exactly 4 numeric digits
  const regex = /^[0-9]{4}$/;
  return regex.test(pin);
}

function handleCustomerSignIn(e) {
  e.preventDefault();
  const phone = document.getElementById('signInPhoneInput').value.trim();
  const pinElem = document.getElementById('signInPinInput');
  const pin = pinElem ? pinElem.value.trim() : '';

  if (!phone || !pin) return;

  if (!validatePhone10Digits(phone)) {
    alert(currentLang === 'ta' ? 'போன் எண் சரியாக 10 இலக்கங்களாக இருக்க வேண்டும் (குறைவாகவோ அல்லது அதிகமாகவோ கூடாது).' : 'Mobile phone number must be exactly 10 digits (cannot be less than or greater than 10).');
    return;
  }

  if (!validatePin4Digits(pin)) {
    alert(currentLang === 'ta' ? 'பாதுகாப்பு PIN சரியாக 4 இலக்க எண்களாக இருக்க வேண்டும் (எ.கா. 1234).' : 'Security PIN must be exactly 4 numeric digits (e.g. 1234).');
    return;
  }

  const foundIdx = customers.findIndex(c => c.phone.trim() === phone);
  if (foundIdx !== -1) {
    const cust = customers[foundIdx];
    const custPin = cust.pin ? String(cust.pin).trim() : '1234';

    if (pin !== custPin) {
      alert(currentLang === 'ta' ? 'தவறான 4-இலக்க PIN! உங்கள் கணக்கிற்குரிய சரியான PIN-ஐ உள்ளிடவும்.' : 'Incorrect 4-digit Security PIN! Please enter the correct PIN for your account.');
      return;
    }

    loggedInCustomerIndex = foundIdx;
    currentAuthRole = 'customer';
    currentRole = 'customer';
    localStorage.setItem('kisan_has_authenticated', 'true');
    localStorage.setItem('kisan_last_cust_phone', phone);
    saveData();
    closeLoginModal();
    applyAuthAccessRules();
    renderAll();

    const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
    showToast(
      currentLang === 'ta' ? 'உள்நுழைவு வெற்றி' : 'Welcome Back!',
      `Logged in as ${cName} (${cust.phone}).`,
      ''
    );
  } else {
    alert(currentLang === 'ta' ? 'இந்த போன் எண் பதிவு செய்யப்படவில்லை. தயவுசெய்து "பதிவு" மூலம் பதிவு செய்யவும்.' : 'Phone number not found! Please click "Register" to create your account.');
    switchAuthTab('register');
    const regPhone = document.getElementById('regPhoneInput');
    if (regPhone) regPhone.value = phone;
  }
}

function handleCustomerRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regNameInput').value.trim();
  const phone = document.getElementById('regPhoneInput').value.trim();
  const village = document.getElementById('regVillageInput').value.trim();
  const pin = document.getElementById('regPinInput').value.trim();
  const confirmPin = document.getElementById('regConfirmPinInput').value.trim();

  if (!name || !phone || !village || !pin || !confirmPin) return;

  // Validation 1: Name must contain only letters and spaces
  if (!validateLettersOnly(name)) {
    alert(currentLang === 'ta' ? 'பெயரில் எண்கள் அல்லது சிறப்பு குறியீடுகள் இருக்கக்கூடாது (எழுத்துக்கள் மட்டுமே அனுமதிக்கப்படும்).' : 'Full Name must contain letters and spaces only (numbers or special symbols are not allowed).');
    return;
  }

  // Validation 2: Phone must be exactly 10 digits
  if (!validatePhone10Digits(phone)) {
    alert(currentLang === 'ta' ? 'போன் எண் சரியாக 10 இலக்கங்களாக இருக்க வேண்டும் (குறைவாகவோ அல்லது அதிகமாகவோ கூடாது).' : 'Phone number must be exactly 10 digits (cannot be less than or greater than 10).');
    return;
  }

  // Validation 3: Location must contain only letters and spaces
  if (!validateLettersOnly(village)) {
    alert(currentLang === 'ta' ? 'கிராமப் பெயரில் எண்கள் அல்லது சிறப்பு குறியீடுகள் இருக்கக்கூடாது (எழுத்துக்கள் மட்டுமே அனுமதிக்கப்படும்).' : 'Village / Location must contain letters and spaces only (numbers or special symbols are not allowed).');
    return;
  }

  // Validation 4: PIN must be exactly 4 digits
  if (!validatePin4Digits(pin)) {
    alert(currentLang === 'ta' ? 'பாதுகாப்பு PIN சரியாக 4 இலக்க எண்களாக இருக்க வேண்டும் (எ.கா. 1234).' : 'Security PIN must be exactly 4 numeric digits (e.g. 1234).');
    return;
  }

  // Validation 5: Set PIN and Confirm PIN MUST MATCH
  if (pin !== confirmPin) {
    alert(currentLang === 'ta' ? 'PIN மற்றும் உறுதிப்படுத்திய PIN இரண்டும் சரியாக பொருந்தவில்லை! தயவுசெய்து மீண்டும் உள்ளிடவும்.' : 'Set PIN and Confirm PIN do not match! Please re-enter the same 4-digit PIN.');
    return;
  }

  // Validation 5B: Form-Level Consent Checkbox
  const consentBox = document.getElementById('regConsentCheckbox');
  if (consentBox && !consentBox.checked) {
    alert(currentLang === 'ta' ? 'தயவுசெய்து விதிமுறைகள் மற்றும் தனியுரிமைக் கொள்கையை ஏற்கவும்.' : 'Please read and agree to the Terms & Conditions and Privacy Policy to register.');
    consentBox.focus();
    return;
  }

  // Validation 6: Phone number MUST BE UNIQUE
  const existing = customers.find(c => c.phone.trim() === phone);
  if (existing) {
    alert(currentLang === 'ta' ? `இந்த போன் எண் (${phone}) ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது (${existing.name}). தயவுசெய்து உள்நுழையவும்.` : `This phone number (${phone}) is already registered for ${existing.name}! Mobile numbers must be unique. Please Sign In.`);
    switchAuthTab('signin');
    document.getElementById('signInPhoneInput').value = phone;
    return;
  }

  const newCust = {
    id: 'CUST-' + Date.now(),
    name: name,
    nameTa: name,
    phone: phone,
    village: village,
    villageTa: village,
    pin: pin,
    landSize: "Farm Land",
    landSizeTa: "விவசாய நிலம்",
    purchases: [],
    remindersSent: []
  };
  customers.push(newCust);
  loggedInCustomerIndex = customers.length - 1;

  currentAuthRole = 'customer';
  currentRole = 'customer';
  localStorage.setItem('kisan_has_authenticated', 'true');
  localStorage.setItem('kisan_last_cust_phone', phone);
  saveData();
  closeLoginModal();
  applyAuthAccessRules();
  renderAll();

  showToast(
    currentLang === 'ta' ? 'பதிவு வெற்றி!' : 'Account Registered!',
    `Welcome ${name} (${phone}). Your account is active with security PIN.`,
    ''
  );
}

function handleAdminSignIn(e) {
  e.preventDefault();
  const passcode = document.getElementById('adminPasscodeInput').value.trim();
  if (passcode === '1234' || passcode.toLowerCase() === 'admin' || passcode === 'admin123') {
    currentAuthRole = 'admin';
    currentRole = 'owner';
    localStorage.setItem('kisan_has_authenticated', 'true');
    saveData();
    closeLoginModal();
    applyAuthAccessRules();
    renderAll();
    setActiveTab('tabOwner');

    showToast(
      currentLang === 'ta' ? 'அட்மின் உள்நுழைவு' : 'Admin Login Successful',
      'You are logged in as Admin. Access to both Customer and Shop Owner View enabled.',
      ''
    );
  } else {
    alert(currentLang === 'ta' ? 'தவறான பாஸ்கோடு! (1234)' : 'Incorrect Admin Passcode! (Default: 1234)');
  }
}

// ----------------------------------------------------
// Language Switcher Logic
// ----------------------------------------------------
function setLanguage(lang) {
  if (currentLang === lang) return; // Do not trigger toast or re-render if already in selected language

  currentLang = lang;
  saveData();
  applyLanguageUI();
  renderAll();
  showToast(
    lang === 'ta' ? 'மொழி மாற்றப்பட்டது' : 'Language Changed',
    lang === 'ta' ? 'தமிழ் மொழி தேர்ந்தெடுக்கப்பட்டது' : 'Simple English language activated',
    ''
  );
}

function applyLanguageUI() {
  document.getElementById('langEnBtn').classList.toggle('active', currentLang === 'en');
  document.getElementById('langTaBtn').classList.toggle('active', currentLang === 'ta');

  // Text updates
  document.getElementById('brandTitle').textContent = t('brandTitle');
  document.getElementById('brandSubtitle').textContent = t('brandSubtitle');
  document.getElementById('roleCustomerBtn').textContent = t('roleCustomer');
  document.getElementById('roleOwnerBtn').textContent = t('roleOwner');
  document.getElementById('cartBtnText').textContent = t('cartLabel');
  
  document.getElementById('tabStockBtn').textContent = t('tabStock');
  document.getElementById('tabOrdersBtn').textContent = t('tabOrders');
  document.getElementById('tabLedgerBtn').textContent = t('tabLedger');
  document.getElementById('tabNotifsBtn').textContent = t('tabNotifs');
  document.getElementById('tabOwnerBtn').textContent = t('tabOwner');

  const recHeader = document.getElementById('recentAccountHeader');
  if (recHeader) {
    recHeader.textContent = currentLang === 'ta' ? ' சமீபத்திய கணக்கு - விரைவு லாகின் செய்ய பரிந்துரைக்கப்படுகிறது' : ' RECENT ACCOUNT SUGGESTED FOR QUICK LOGIN';
  }

  document.getElementById('statInStockLabel').textContent = t('statInStock');
  document.getElementById('statActiveOrdersLabel').textContent = t('statActiveOrders');
  document.getElementById('statPendingCreditLabel').textContent = t('statPendingCredit');

  document.getElementById('stockSearchInput').placeholder = t('searchPlaceholder');
  document.getElementById('optAllCat').textContent = t('allCategories');
  document.getElementById('optFertilizers').textContent = t('catFertilizers');
  document.getElementById('optChemicals').textContent = t('catChemicals');
  document.getElementById('optOrganic').textContent = t('catOrganic');
  document.getElementById('optGrowth').textContent = t('catGrowth');

  document.getElementById('optAllStock').textContent = t('allStockStatus');
  document.getElementById('optInStock').textContent = t('inStockOnly');
  document.getElementById('optOutStock').textContent = t('outOfStock');
  document.getElementById('optAllCrops').textContent = t('allCrops');

  document.getElementById('printStatementBtn').textContent = t('printStatement');
  document.getElementById('markAllReadBtn').textContent = t('markAllRead');

  document.getElementById('thInvoice').textContent = t('invoiceHeader');
  document.getElementById('thDate').textContent = t('dateHeader');
  document.getElementById('thItems').textContent = t('itemsHeader');
  document.getElementById('thTotal').textContent = t('totalHeader');
  document.getElementById('thPaid').textContent = t('paidHeader');
  document.getElementById('thBalance').textContent = t('balanceHeader');
  document.getElementById('thStatus').textContent = t('statusHeader');
  document.getElementById('thAction').textContent = t('actionHeader');

  document.getElementById('logOfflineTitle').textContent = t('logOfflineTitle');
  document.getElementById('logOfflineSub').textContent = t('logOfflineSub');
  document.getElementById('lblSelectCust').textContent = t('selectCustomerLabel');
  document.getElementById('lblSelectProd').textContent = t('selectProductLabel');
  document.getElementById('lblQty').textContent = t('qtyLabel');
  document.getElementById('lblUpfront').textContent = t('upfrontPaidLabel');
  document.getElementById('lblTotalBill').textContent = t('totalBillLabel');
  document.getElementById('lblAddedCredit').textContent = t('addedToCreditLabel');
  document.getElementById('btnCreateBill').textContent = t('createBillBtn');

  document.getElementById('overdueTitle').textContent = t('overdueTitle');
  const overdueSubEl = document.getElementById('overdueSub');
  if (overdueSubEl) overdueSubEl.textContent = t('overdueSub');

  const isOwnerMode = (currentAuthRole === 'admin' || currentRole === 'owner');
  const cartTitleText = isOwnerMode ? t('cartModalTitleOwner') : t('cartModalTitleCustomer');
  const cartTitleEl = document.getElementById('cartModalTitle');
  if (cartTitleEl) cartTitleEl.textContent = `Cart`;

  const createOrderBtn = document.getElementById('createNewOrderBtn');
  if (createOrderBtn) createOrderBtn.textContent = `Cart`;

  // Footer Dynamic Translations
  const footerSubtitleEl = document.getElementById('footerBrandSubtitle');
  if (footerSubtitleEl) footerSubtitleEl.textContent = t('brandSubtitle');
  const footerDescEl = document.getElementById('footerAboutDescText');
  if (footerDescEl) footerDescEl.textContent = t('footerAboutDesc');
  const footerLegalH = document.getElementById('footerLegalHeader');
  if (footerLegalH) footerLegalH.textContent = t('footerQuickLinks');
  const footerCompH = document.getElementById('footerComplianceHeader');
  if (footerCompH) footerCompH.textContent = t('footerComplianceTitle');
  const footerContH = document.getElementById('footerContactHeader');
  if (footerContH) footerContH.textContent = t('footerContactTitle');
  const footerCopyEl = document.getElementById('footerCopyrightText');
  if (footerCopyEl) footerCopyEl.textContent = t('footerCopyright');

  // Cookie Banner Dynamic Translations
  const cookieHeading = document.getElementById('cookieBannerHeading');
  if (cookieHeading) cookieHeading.textContent = t('cookieBannerTitle');
  const cookieDesc = document.getElementById('cookieBannerDesc');
  if (cookieDesc) cookieDesc.textContent = t('cookieBannerText');
  const cookieAcceptAllBtn = document.getElementById('cookieAcceptAllBtn');
  if (cookieAcceptAllBtn) cookieAcceptAllBtn.textContent = t('cookieAcceptAll');
  const cookieEssentialBtn = document.getElementById('cookieEssentialBtn');
  if (cookieEssentialBtn) cookieEssentialBtn.textContent = t('cookieEssentialOnly');
  const cookieLearnMoreBtn = document.getElementById('cookieLearnMoreBtn');
  if (cookieLearnMoreBtn) cookieLearnMoreBtn.textContent = t('cookieViewPolicy');

  // Registration Consent Text
  const lblRegConsent = document.getElementById('lblRegConsentText');
  if (lblRegConsent) {
    lblRegConsent.innerHTML = currentLang === 'ta'
      ? 'நான் <a href="#" onclick="openPolicyModal(\'terms\'); return false;">விதிமுறைகளையும் நிபந்தனைகளையும்</a> ஏற்றுக்கொள்கிறேன், <a href="#" onclick="openPolicyModal(\'privacy\'); return false;">தனியுரிமைக் கொள்கையை</a> உறுதிப்படுத்துகிறேன்.'
      : 'I have read and agree to the <a href="#" onclick="openPolicyModal(\'terms\'); return false;">Terms & Conditions</a>, acknowledge the <a href="#" onclick="openPolicyModal(\'privacy\'); return false;">Privacy Policy</a>, and consent to transactional alerts.';
  }

  // Role Alert Text
  const roleAlertMsg = document.getElementById('roleAlertMsg');
  if (roleAlertMsg) {
    if (currentRole === 'customer') {
      roleAlertMsg.innerHTML = currentLang === 'ta' ? 'ℹ️ <em>உங்கள் சொந்த கடன் விவரங்கள் மட்டுமே காட்டப்படும்</em>' : 'ℹ️ <em>Privacy Protected: Showing ONLY your personal credit ledger</em>';
    } else {
      roleAlertMsg.innerHTML = currentLang === 'ta' ? '<em>உரிமையாளர் பக்கம்: பேக்கிங் மற்றும் கடன் நினைவூட்டல்</em>' : '<em>Shop Owner Mode: Manage order packing, log sales & send reminders</em>';
    }
  }

  // Hero Titles (Exclusive to Stock Availability Tab)
  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  if (heroTitle && heroSubtitle) {
    heroTitle.innerHTML = t('heroCustomerTitle');
    heroSubtitle.innerHTML = t('heroCustomerSubtitle');
  }
}

function renderAll() {
  updateHeroStats();
  renderStockGrid();
  renderCustomerLedger();
  renderCustomerOrders();
  renderOwnerOrders();
  renderOverdueTable();
  renderCrudProductsTable();
  renderCrudCustomersTable();
  populateAdminFormSelects();
  renderNotifications();
  updateCartBadge();
}

// ----------------------------------------------------
// CRUD SUB-TAB SWITCHING (EXCLUSIVE TO SHOP OWNER)
// ----------------------------------------------------
function switchCrudSubTab(tabName) {
  document.getElementById('crudProductsSection').style.display = tabName === 'products' ? 'block' : 'none';
  document.getElementById('crudCustomersSection').style.display = tabName === 'customers' ? 'block' : 'none';
  document.getElementById('crudOrdersSection').style.display = tabName === 'orders' ? 'block' : 'none';

  document.getElementById('crudTabProductsBtn').style.background = tabName === 'products' ? 'var(--primary-light)' : '#ffffff';
  document.getElementById('crudTabProductsBtn').style.color = tabName === 'products' ? 'var(--primary-color)' : 'var(--text-muted)';
  
  document.getElementById('crudTabCustomersBtn').style.background = tabName === 'customers' ? 'var(--primary-light)' : '#ffffff';
  document.getElementById('crudTabCustomersBtn').style.color = tabName === 'customers' ? 'var(--primary-color)' : 'var(--text-muted)';

  document.getElementById('crudTabOrdersBtn').style.background = tabName === 'orders' ? 'var(--primary-light)' : '#ffffff';
  document.getElementById('crudTabOrdersBtn').style.color = tabName === 'orders' ? 'var(--primary-color)' : 'var(--text-muted)';

  sessionStorage.setItem('kisan_active_crud_sub_tab', tabName);
  localStorage.setItem('kisan_active_crud_sub_tab', tabName);
}

// ----------------------------------------------------
// 1. PRODUCTS CRUD (Create, Read, Update, Delete)
// ----------------------------------------------------
function previewProductImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    tempUploadedImageBase64 = e.target.result;
    const previewImg = document.getElementById('imagePreviewImg');
    const previewBox = document.getElementById('imagePreviewBox');

    previewImg.src = tempUploadedImageBase64;
    previewBox.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function handleCropSelectChange() {
  const sel = document.getElementById('newProdCropSelect');
  const manualInput = document.getElementById('newProdCropManual');
  if (!sel || !manualInput) return;

  if (sel.value && sel.value !== 'CUSTOM') {
    manualInput.value = sel.value;
  } else if (sel.value === 'CUSTOM') {
    manualInput.value = '';
    manualInput.focus();
  }
}

function handleAddProductWithPhoto(e) {
  e.preventDefault();
  const name = document.getElementById('newProdName').value.trim();
  const nameTa = name;
  const category = document.getElementById('newProdCat').value;
  const brandUnit = document.getElementById('newProdBrandUnit').value.trim();
  const price = parseFloat(document.getElementById('newProdPrice').value);
  const stock = parseInt(document.getElementById('newProdStock').value, 10);

  const cropSelectElem = document.getElementById('newProdCropSelect');
  const cropManualElem = document.getElementById('newProdCropManual');
  const cropSelectVal = cropSelectElem ? cropSelectElem.value : '';
  const cropManualVal = cropManualElem ? cropManualElem.value.trim() : '';

  const chosenCrop = cropManualVal || (cropSelectVal && cropSelectVal !== 'CUSTOM' ? cropSelectVal : 'All Crops');
  const cropList = chosenCrop.split(/[,&]+/).map(c => c.trim()).filter(c => c.length > 0);
  if (cropList.length === 0) cropList.push("All Crops");

  if (!tempUploadedImageBase64) {
    alert(currentLang === 'ta' ? 'தயவுசெய்து பொருளின் படத்தை தேர்ந்தெடுக்கவும்!' : 'Please select an image file for the product!');
    return;
  }

  if (!name || !price || !stock) return;

  const newProd = {
    id: 'PROD-' + Date.now(),
    name: name,
    nameTa: nameTa,
    category: category,
    type: category,
    brand: brandUnit.split('•')[0] || brandUnit,
    price: price,
    mrp: Math.round(price * 1.1),
    unit: brandUnit.includes('•') ? brandUnit.split('•')[1].trim() : 'Pack / Bag',
    unitTa: brandUnit.includes('•') ? brandUnit.split('•')[1].trim() : 'மூட்டை / பாட்டில்',
    stock: stock,
    minStockThreshold: 10,
    cropSuitability: cropList,
    cropSuitabilityTa: cropList,
    dosage: "Apply as per agronomist recommendation.",
    dosageTa: "விவசாய ஆலோசகரின் பரிந்துரைப்படி இடவும்.",
    msdsInfo: "Store in cool dry place. Keep away from direct sunlight.",
    rating: 5.0,
    imageIcon: category === 'Fertilizers' ? '' : '',
    imageUrl: tempUploadedImageBase64
  };

  products.unshift(newProd);
  saveData();
  renderAll();

  document.getElementById('addProductPhotoForm').reset();
  document.getElementById('imagePreviewBox').style.display = 'none';
  tempUploadedImageBase64 = '';

  showToast('Product Saved with Image!', `${name} added to shop catalog (${cropList.join(', ')}).`, '');
}

function renderCrudProductsTable() {
  const tbody = document.getElementById('crudProductsTableBody');
  if (!tbody) return;

  tbody.innerHTML = products.map(p => {
    const prodName = (currentLang === 'ta' && p.nameTa) ? p.nameTa : p.name;
    return `
      <tr>
        <td>
          <img src="${p.imageUrl}" style="width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
        </td>
        <td>
          <strong>${prodName}</strong><br>
          <span style="font-size: 11px; color: var(--text-muted);">${p.brand} • ${p.unit}</span>
        </td>
        <td><span class="status-badge status-paid" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">${p.category}</span></td>
        <td style="font-weight: 700; color: var(--text-primary);">₹${p.price.toLocaleString('en-IN')}</td>
        <td><strong style="color: ${p.stock === 0 ? 'var(--danger-color)' : (p.stock <= p.minStockThreshold ? 'var(--warning-color)' : 'var(--success-color)')};">${p.stock === 0 ? (currentLang === 'ta' ? '0 (தீர்ந்துவிட்டது)' : '0 (Out of Stock)') : p.stock}</strong></td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-action" style="background: var(--primary-light); color: var(--primary-color); border-color: #a7f3d0; font-weight: 600;" onclick="openEditProductModal('${p.id}')">
              Edit
            </button>
            <button class="btn-action" style="background: var(--danger-bg); color: var(--danger-color); border-color: #fecaca; font-weight: 600;" onclick="deleteProductItem('${p.id}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditProductModal(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  document.getElementById('editProdId').value = prod.id;
  document.getElementById('editProdName').value = prod.name;
  document.getElementById('editProdPrice').value = prod.price;
  document.getElementById('editProdStock').value = prod.stock;
  document.getElementById('editProdCat').value = prod.category;

  tempEditImageBase64 = prod.imageUrl;
  document.getElementById('editImagePreviewImg').src = prod.imageUrl;

  document.getElementById('editProductModal').classList.add('active');
}

function closeEditProductModal() {
  document.getElementById('editProductModal').classList.remove('active');
}

function previewEditImageFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    tempEditImageBase64 = e.target.result;
    document.getElementById('editImagePreviewImg').src = tempEditImageBase64;
  };
  reader.readAsDataURL(file);
}

function handleSaveEditProduct(e) {
  e.preventDefault();
  const prodId = document.getElementById('editProdId').value;
  const prod = products.find(p => p.id === prodId);
  if (!prod) return;

  prod.name = document.getElementById('editProdName').value.trim();
  prod.nameTa = prod.name;
  prod.price = parseFloat(document.getElementById('editProdPrice').value);
  prod.stock = parseInt(document.getElementById('editProdStock').value, 10);
  prod.category = document.getElementById('editProdCat').value;
  prod.imageUrl = tempEditImageBase64;

  saveData();
  closeEditProductModal();
  renderAll();

  showToast('Product Updated', `${prod.name} changes saved successfully.`, '️');
}

function deleteProductItem(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  if (confirm(`Are you sure you want to delete "${prod.name}" from inventory?`)) {
    products = products.filter(p => p.id !== productId);
    saveData();
    renderAll();
    showToast('Product Deleted', `${prod.name} removed from store catalog.`, '️');
  }
}

// ----------------------------------------------------
// 2. CUSTOMERS CRUD (Create, Read, Update, Delete)
// ----------------------------------------------------
function handleOwnerAddCustomer(e) {
  e.preventDefault();
  const name = document.getElementById('ownerCustName').value.trim();
  const phone = document.getElementById('ownerCustPhone').value.trim();
  const village = document.getElementById('ownerCustVillage').value.trim();
  const pinElem = document.getElementById('ownerCustPin');
  const confirmPinElem = document.getElementById('ownerCustConfirmPin');

  const pin = pinElem ? pinElem.value.trim() : '';
  const confirmPin = confirmPinElem ? confirmPinElem.value.trim() : '';

  if (!name || !phone || !village || !pin || !confirmPin) return;

  if (!validateLettersOnly(name)) {
    alert(currentLang === 'ta' ? 'பெயரில் எண்கள் அல்லது சிறப்பு குறியீடுகள் இருக்கக்கூடாது (எழுத்துக்கள் மட்டுமே).' : 'Farmer Name must contain letters and spaces only (no numbers or special characters).');
    return;
  }

  if (!validatePhone10Digits(phone)) {
    alert(currentLang === 'ta' ? 'போன் எண் சரியாக 10 இலக்கங்களாக இருக்க வேண்டும்.' : 'Phone number must be exactly 10 digits (cannot be less than or greater than 10).');
    return;
  }

  if (!validateLettersOnly(village)) {
    alert(currentLang === 'ta' ? 'கிராமப் பெயரில் எண்கள் அல்லது சிறப்பு குறியீடுகள் இருக்கக்கூடாது.' : 'Village Location must contain letters and spaces only (no numbers or special characters).');
    return;
  }

  if (!validatePin4Digits(pin)) {
    alert(currentLang === 'ta' ? 'பாதுகாப்பு PIN சரியாக 4 இலக்க எண்களாக இருக்க வேண்டும் (எ.கா. 1234).' : 'Security PIN must be exactly 4 numeric digits (e.g. 1234).');
    return;
  }

  if (pin !== confirmPin) {
    alert(currentLang === 'ta' ? 'PIN மற்றும் உறுதிப்படுத்திய PIN இரண்டும் சரியாக பொருந்தவில்லை!' : 'Set PIN and Confirm PIN do not match! Please re-enter the same 4-digit PIN.');
    return;
  }

  const existing = customers.find(c => c.phone.trim() === phone);
  if (existing) {
    alert(currentLang === 'ta' ? `இந்த போன் எண் (${phone}) ஏற்கனவே ${existing.name} கணக்கில் உள்ளது.` : `Phone number ${phone} is already registered for customer ${existing.name}! Mobile numbers must be unique.`);
    return;
  }

  const newCust = {
    id: 'CUST-' + Date.now(),
    name: name,
    nameTa: name,
    phone: phone,
    village: village,
    villageTa: village,
    pin: pin,
    landSize: "Farm Land",
    landSizeTa: "விவசாய நிலம்",
    purchases: [],
    remindersSent: []
  };

  customers.push(newCust);
  saveData();
  renderAll();

  document.getElementById('ownerAddCustForm').reset();
  showToast(
    currentLang === 'ta' ? 'புதிய வாடிக்கையாளர் கணக்கு பதிவு செய்யப்பட்டது!' : 'New Customer Registered!',
    `${name} (${phone}) registered with PIN. Customer can now log in directly.`,
    ''
  );
}

function renderCrudCustomersTable() {
  const tbody = document.getElementById('crudCustomersTableBody');
  if (!tbody) return;

  // Sort customers ascending by name (A-Z)
  const sortedCustomers = customers.map((c, originalIndex) => ({ ...c, originalIndex }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  tbody.innerHTML = sortedCustomers.map(c => {
    const idx = c.originalIndex;
    let totalPurch = c.purchases.reduce((acc, p) => acc + p.totalAmount, 0);
    let unpaidDue = c.purchases.reduce((acc, p) => acc + p.balance, 0);
    const cName = (currentLang === 'ta' && c.nameTa) ? c.nameTa : c.name;
    const cVillage = (currentLang === 'ta' && c.villageTa) ? c.villageTa : c.village;

    return `
      <tr>
        <td><strong>${cName}</strong></td>
        <td>${c.phone}</td>
        <td>${cVillage}</td>
        <td>₹${totalPurch.toLocaleString('en-IN')}</td>
        <td style="color: var(--warning-color); font-weight: 700;">₹${unpaidDue.toLocaleString('en-IN')}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-action" style="background: var(--primary-light); color: var(--primary-color); border-color: #a7f3d0; font-weight: 600;" onclick="openEditCustomerModal(${idx})">
              Edit Profile
            </button>
            <button class="btn-action" style="background: var(--danger-bg); color: var(--danger-color); border-color: #fecaca; font-weight: 600;" onclick="deleteCustomerAccount(${idx})">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditCustomerModal(custIndex) {
  const cust = customers[custIndex];
  if (!cust) return;

  document.getElementById('editCustIndex').value = custIndex;
  document.getElementById('editCustName').value = cust.name;
  document.getElementById('editCustPhone').value = cust.phone;
  document.getElementById('editCustVillage').value = cust.village;

  document.getElementById('editCustomerModal').classList.add('active');
}

function closeEditCustomerModal() {
  document.getElementById('editCustomerModal').classList.remove('active');
}

function handleSaveEditCustomer(e) {
  e.preventDefault();
  const idx = parseInt(document.getElementById('editCustIndex').value, 10);
  const cust = customers[idx];
  if (!cust) return;

  const newName = document.getElementById('editCustName').value.trim();
  const newVillage = document.getElementById('editCustVillage').value.trim();

  if (!newName || !newVillage) return;

  if (!validateLettersOnly(newName)) {
    alert(currentLang === 'ta' ? 'பெயரில் எண்கள் அல்லது சிறப்பு குறியீடுகள் இருக்கக்கூடாது.' : 'Farmer Name must contain letters and spaces only.');
    return;
  }

  if (!validateLettersOnly(newVillage)) {
    alert(currentLang === 'ta' ? 'கிராமப் பெயரில் எண்கள் அல்லது சிறப்பு குறியீடுகள் இருக்கக்கூடாது.' : 'Village Location must contain letters and spaces only.');
    return;
  }

  const oldName = cust.name;
  const oldVillage = cust.village;

  const nameChanged = oldName !== newName;
  const villageChanged = oldVillage !== newVillage;

  if (!nameChanged && !villageChanged) {
    closeEditCustomerModal();
    return;
  }

  cust.name = newName;
  cust.nameTa = newName;
  cust.village = newVillage;
  cust.villageTa = newVillage;

  // Build detailed change message
  let changeListEn = [];
  let changeListTa = [];

  if (nameChanged) {
    changeListEn.push(`Name changed from '${oldName}' to '${newName}'`);
    changeListTa.push(`பெயர் '${oldName}' இலிருந்து '${newName}' என மாற்றப்பட்டது`);
  }
  if (villageChanged) {
    changeListEn.push(`Village Location changed from '${oldVillage}' to '${newVillage}'`);
    changeListTa.push(`கிராம இடம் '${oldVillage}' இலிருந்து '${newVillage}' என மாற்றப்பட்டது`);
  }

  const msgEn = `Admin updated your account details: ${changeListEn.join(', ')}.`;
  const msgTa = `அட்மின் உங்கள் கணக்கு விவரங்களை புதுப்பித்துள்ளார்: ${changeListTa.join(', ')}.`;

  // Add Notification targeted specifically to updated customer account
  addNotification(
    'PROFILE_UPDATED',
    'Account Profile Updated by Admin',
    msgEn,
    '️',
    cust.phone,
    'அட்மின் மூலம் சுயவிவரம் புதுப்பிக்கப்பட்டது',
    msgTa
  );

  saveData();
  closeEditCustomerModal();
  renderAll();

  showToast('Customer Profile Updated', `${cust.name} changes saved and customer notified.`, '️');
}

function deleteCustomerAccount(custIndex) {
  const cust = customers[custIndex];
  if (!cust) return;

  if (confirm(`Are you sure you want to delete customer "${cust.name}"?`)) {
    customers.splice(custIndex, 1);
    if (loggedInCustomerIndex >= customers.length) {
      loggedInCustomerIndex = 0;
    }
    saveData();
    renderAll();
    showToast('Customer Deleted', `${cust.name} removed.`, '️');
  }
}

// ----------------------------------------------------
// 3. ORDERS CRUD & FULFILLMENT
// ----------------------------------------------------
function deleteOrder(orderId) {
  const ord = orders.find(o => o.orderId === orderId);
  if (!ord) return;

  const cName = (currentLang === 'ta' && ord.customerNameTa) ? ord.customerNameTa : (ord.customerName || 'Customer');

  if (confirm(`Are you sure you want to cancel and delete Order ${ord.orderId}?`)) {
    // 1. Notify Customer directly
    addNotification(
      'ORDER_CANCELLED',
      `Order ${ord.orderId} Cancelled`,
      `Your order has been canceled by Admin.`,
      '',
      ord.customerPhone,
      `ஆர்டர் ${ord.orderId} ரத்து செய்யப்பட்டது`,
      `உங்கள் ஆர்டர் அட்மினால் ரத்து செய்யப்பட்டது.`
    );

    // 2. Notify Admin in Event Logs
    addNotification(
      'ORDER_CANCELLED',
      `Order ${ord.orderId} Cancelled`,
      `You canceled ${cName}'s order (${ord.orderId}).`,
      '️',
      null,
      `ஆர்டர் ${ord.orderId} ரத்து செய்யப்பட்டது`,
      `நீங்கள் ${cName} அவர்களின் ஆர்டரை (${ord.orderId}) ரத்து செய்தீர்கள்.`
    );

    // Restore inventory stock if order was not yet completed
    if (ord.status !== 'COMPLETED' && Array.isArray(ord.items)) {
      ord.items.forEach(item => {
        const prod = products.find(p => p.id === item.productId || p.name === item.name);
        if (prod) {
          prod.stock += item.qty;
        }
      });
    }

    orders = orders.filter(o => o.orderId !== orderId);
    saveData();
    renderAll();
    showToast(
      currentLang === 'ta' ? 'ஆர்டர் ரத்து செய்யப்பட்டது' : 'Order Cancelled',
      `Order ${ord.orderId} for ${cName} was cancelled.`,
      '️'
    );
  }
}

// ----------------------------------------------------
// Role Switcher
// ----------------------------------------------------
function switchRole(role) {
  currentRole = role;
  const customerBtn = document.getElementById('roleCustomerBtn');
  const ownerBtn = document.getElementById('roleOwnerBtn');
  const ownerTab = document.querySelector('.owner-only-tab');

  if (role === 'customer') {
    customerBtn.classList.add('active');
    ownerBtn.classList.remove('active');
    ownerTab.style.display = 'none';

    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'tabOwner') {
      setActiveTab('tabStock');
    }
  } else {
    ownerBtn.classList.add('active');
    customerBtn.classList.remove('active');
    ownerTab.style.display = 'inline-flex';

    setActiveTab('tabOwner');
  }

  applyLanguageUI();
  renderAll();
}

function setActiveTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.classList.toggle('active', sec.id === tabId);
  });
  sessionStorage.setItem('kisan_active_top_tab', tabId);
  localStorage.setItem('kisan_active_top_tab', tabId);
}

// ----------------------------------------------------
// Stats Bar
// ----------------------------------------------------
function updateHeroStats() {
  const inStockCount = products.filter(p => p.stock > 0).length;
  const activeOrders = orders.filter(o => o.status !== 'COMPLETED').length;

  let totalDue = 0;
  if (currentRole === 'customer') {
    const activeCust = customers[loggedInCustomerIndex];
    if (activeCust) {
      totalDue = activeCust.purchases.reduce((acc, p) => acc + p.balance, 0);
    }
  } else {
    customers.forEach(c => {
      c.purchases.forEach(p => {
        totalDue += (p.balance || 0);
      });
    });
  }

  document.getElementById('statInStockCount').textContent = inStockCount;
  document.getElementById('statActiveOrdersCount').textContent = activeOrders;
  document.getElementById('statTotalDueVal').textContent = `₹${totalDue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// ----------------------------------------------------
// Tab 1: Stock Catalog (READ-ONLY FOR CUSTOMERS)
// ----------------------------------------------------
function renderStockGrid() {
  const container = document.getElementById('productGridContainer');
  const search = document.getElementById('stockSearchInput').value.toLowerCase().trim();
  const category = document.getElementById('categoryFilter').value;
  const stockStatus = document.getElementById('stockStatusFilter').value;
  const crop = document.getElementById('cropFilter').value;

  const filtered = products.filter(p => {
    const pName = (currentLang === 'ta' && p.nameTa) ? p.nameTa : p.name;
    const matchSearch = pName.toLowerCase().includes(search) || 
                        p.name.toLowerCase().includes(search) ||
                        p.brand.toLowerCase().includes(search);
    const matchCat = category === 'ALL' || p.category === category;
    const matchCrop = crop === 'ALL' || p.cropSuitability.some(c => c.toLowerCase().includes(crop.toLowerCase()));
    
    let matchStatus = true;
    if (stockStatus === 'INSTOCK') matchStatus = p.stock > 0;
    else if (stockStatus === 'OUTSTOCK') matchStatus = p.stock === 0;

    return matchSearch && matchCat && matchCrop && matchStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: #ffffff; border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        
        <h3 style="font-size: 16px; color: var(--text-primary);">${currentLang === 'ta' ? 'பொருட்கள் எதுவும் கிடைக்கவில்லை' : 'No Products Found'}</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(p => {
    let badgeClass = 'badge-instock';
    let badgeText = t('badgeInStock');
    let fillClass = 'fill-green';

    if (p.stock === 0) {
      badgeClass = 'badge-outstock';
      badgeText = t('badgeOutStock');
      fillClass = 'fill-red';
    }

    const pct = Math.min(100, Math.round((p.stock / (p.minStockThreshold * 3)) * 100));

    const prodName = (currentLang === 'ta' && p.nameTa) ? p.nameTa : p.name;
    const prodUnit = (currentLang === 'ta' && p.unitTa) ? p.unitTa : p.unit;
    const cropList = (currentLang === 'ta' && p.cropSuitabilityTa) ? p.cropSuitabilityTa : p.cropSuitability;

    return `
      <div class="product-card">
        <div>
          <!-- Direct Chemical / Fertilizer Image Display -->
          <div style="width: 100%; height: 180px; border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 14px; border: 1px solid var(--border-color); background: #f5f5f7; position: relative;">
            <img src="${p.imageUrl || 'assets/iffco_urea.jpg'}" 
                 alt="${prodName} - ${p.brand} ${p.category} ${prodUnit}" 
                 style="width: 100%; height: 100%; object-fit: cover;"
                 onerror="this.onerror=null; this.src='assets/iffco_urea.jpg';">
            <span class="product-badge ${badgeClass}">${badgeText}</span>
            <span style="position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.65); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); color: white; padding: 3px 10px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 600;">
              ${p.category}
            </span>
          </div>

          <div class="product-header" style="margin-bottom: 6px;">
            <div class="product-title">
              <h3>${prodName}</h3>
              <div class="product-brand">${p.brand} • ${p.type}</div>
            </div>
          </div>

          <div class="product-details">
            <div><strong>${currentLang === 'ta' ? 'அளவு:' : 'Unit:'}</strong> ${prodUnit}</div>
            <div class="product-crop-tags">
              ${cropList.map(c => `<span class="crop-chip">${c}</span>`).join('')}
            </div>
          </div>

          <div class="stock-bar-container">
            <div class="stock-bar-header">
              <span style="color: var(--text-muted);">${currentLang === 'ta' ? 'இருப்பு எண்ணிக்கை:' : 'Available Stock:'}</span>
              <strong style="color: ${p.stock === 0 ? 'var(--danger-color)' : 'var(--text-primary)'}; font-weight: 700;">
                ${p.stock === 0 ? `0 (${badgeText})` : p.stock}
              </strong>
            </div>
          </div>
        </div>

        <div>
          <div class="product-price-row">
            <div>
              <span class="product-price">₹${p.price.toLocaleString('en-IN')}</span>
              <span class="mrp-strike">MRP ₹${p.mrp.toLocaleString('en-IN')}</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
              <button class="btn-details" onclick="showProductModal('${p.id}')">${t('dosageBtn')}</button>
              ${p.stock > 0 ? `
                <button class="btn-action" style="background: var(--primary-gradient); color: white; border: none; font-weight: 600; box-shadow: 0 2px 8px rgba(21, 128, 61, 0.28); border-radius: var(--radius-pill);" onclick="addToCart('${p.id}')">
                  ${t('reserveBtn')}
                </button>
              ` : `
                <button class="btn-action btn-outstock" disabled>${badgeText}</button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showProductModal(prodId) {
  const p = products.find(prod => prod.id === prodId);
  if (!p) return;

  const prodName = (currentLang === 'ta' && p.nameTa) ? p.nameTa : p.name;
  const prodUnit = (currentLang === 'ta' && p.unitTa) ? p.unitTa : p.unit;
  const prodDosage = (currentLang === 'ta' && p.dosageTa) ? p.dosageTa : p.dosage;

  document.getElementById('prodModalTitle').textContent = prodName;
  document.getElementById('prodModalBody').innerHTML = `
    <div style="width: 100%; height: 180px; border-radius: var(--radius-md); overflow: hidden; margin-bottom: 16px; border: 1px solid var(--border-color);">
      <img src="${p.imageUrl}" alt="${prodName} - ${p.brand} ${p.category} ${prodUnit}" style="width: 100%; height: 100%; object-fit: cover;">
    </div>

    <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
      <div>
        <div style="font-size: 13px; font-weight: 600; color: var(--primary-color);">${p.brand} • ${p.category}</div>
        <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);">₹${p.price} <span style="font-size: 12px; color: var(--text-muted);">per ${prodUnit}</span></div>
      </div>
    </div>

    <div style="background: var(--warning-bg); border: 1px solid #fde68a; padding: 14px; border-radius: var(--radius-sm); margin-bottom: 14px;">
      <h5 style="color: var(--warning-color); font-size: 13px; font-weight: 600; margin-bottom: 4px;">${currentLang === 'ta' ? 'பாதுகாப்பு & பயன்பாட்டு வழிகாட்டல்:' : 'Safety & Agronomy Advisory:'}</h5>
      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">${p.msdsInfo}</p>
      <div style="font-size: 12px; color: var(--text-muted);"><strong>${currentLang === 'ta' ? 'அளவு விபரம்:' : 'Recommended Dosage:'}</strong> ${prodDosage}</div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 12px;">
      <span>${currentLang === 'ta' ? 'இருப்பு:' : 'Stock:'} <strong style="color: ${p.stock === 0 ? 'var(--danger-color)' : 'var(--text-primary)'};">${p.stock === 0 ? (currentLang === 'ta' ? 'தீர்ந்துவிட்டது (0 units)' : 'Out of Stock (0 units)') : `${p.stock} units`}</strong></span>
      <span>
        ${currentLang === 'ta' ? 'மதிப்பீடு:' : 'Rating:'} 
        <button type="button" onclick="openPolicyModal('reviews')" style="background:none; border:none; color: var(--warning-color); font-weight:700; cursor:pointer; text-decoration:underline; font-size: 12px;" title="Click to view verified review policy">
          ${p.rating} / 5.0 (Verified)
        </button>
      </span>
    </div>
  `;

  document.getElementById('productModal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
}

// ----------------------------------------------------
// Cart
// ----------------------------------------------------
function addToCart(productId) {
  const prod = products.find(p => p.id === productId);
  if (!prod || prod.stock <= 0) return;

  const existing = cart.find(c => c.productId === productId);
  if (existing) {
    if (existing.qty + 1 > prod.stock) {
      alert(`Stock limit reached! Max stock: ${prod.stock}`);
      return;
    }
    existing.qty += 1;
  } else {
    cart.push({ productId: productId, qty: 1 });
  }

  updateCartBadge();
  const prodName = (currentLang === 'ta' && prod.nameTa) ? prod.nameTa : prod.name;
  showToast(currentLang === 'ta' ? 'கூடையில் சேர்க்கப்பட்டது' : 'Added to Cart', prodName, '');
}

function updateCartBadge() {
  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  document.getElementById('cartCountBadge').textContent = totalItems;
}

function updateCartQty(productId, delta) {
  const item = cart.find(c => c.productId === productId);
  const prod = products.find(p => p.id === productId);

  if (!item || !prod) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(c => c.productId !== productId);
  } else if (item.qty > prod.stock) {
    alert(`Only ${prod.stock} units in stock!`);
    item.qty = prod.stock;
  }

  updateCartBadge();
  renderCartModal();
}

function openCartModal() {
  renderCartModal();
  document.getElementById('cartModal').classList.add('active');
}

function closeCartModal() {
  document.getElementById('cartModal').classList.remove('active');
}

function goToStockCatalog() {
  closeCartModal();
  setActiveTab('tabStock');
  setTimeout(() => {
    const catalogEl = document.getElementById('productGridContainer') || document.getElementById('tabStock');
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: 'smooth' });
    }
  }, 100);
}

function renderCartModal() {
  const container = document.getElementById('cartModalContent');

  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 16px;">
        
        <h4 style="font-size: 16px; color: var(--text-primary);">${currentLang === 'ta' ? 'கூடை காலியாக உள்ளது' : 'Your Cart is Empty'}</h4>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">${currentLang === 'ta' ? 'பொருட்களை தேர்வு செய்து முன்பதிவு செய்யவும்.' : 'Browse catalog and click Reserve.'}</p>
        <button class="btn-primary" onclick="goToStockCatalog()">${currentLang === 'ta' ? 'பொருட்களை பார்க்க' : 'Browse Catalog'}</button>
      </div>
    `;
    return;
  }

  let grandTotal = 0;
  const itemsHtml = cart.map(cItem => {
    const p = products.find(prod => prod.id === cItem.productId);
    if (!p) return '';
    const itemTotal = p.price * cItem.qty;
    grandTotal += itemTotal;

    const prodName = (currentLang === 'ta' && p.nameTa) ? p.nameTa : p.name;
    const prodUnit = (currentLang === 'ta' && p.unitTa) ? p.unitTa : p.unit;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
        <div>
          <div style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${prodName}</div>
          <div style="font-size: 12px; color: var(--text-muted);">₹${p.price} per ${prodUnit}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
            <button style="border:none; background: #f1f5f9; width: 26px; height: 26px; cursor: pointer;" onclick="updateCartQty('${p.id}', -1)">-</button>
            <span style="padding: 0 10px; font-weight: 600; font-size: 13px;">${cItem.qty}</span>
            <button style="border:none; background: #f1f5f9; width: 26px; height: 26px; cursor: pointer;" onclick="updateCartQty('${p.id}', 1)">+</button>
          </div>
          <strong style="font-size: 14px; min-width: 70px; text-align: right;">₹${itemTotal.toLocaleString('en-IN')}</strong>
        </div>
      </div>
    `;
  }).join('');

  const activeCust = customers[loggedInCustomerIndex];
  const activeCustName = (currentLang === 'ta' && activeCust.nameTa) ? activeCust.nameTa : activeCust.name;

  container.innerHTML = `
    <div style="max-height: 220px; overflow-y: auto; margin-bottom: 16px;">
      ${itemsHtml}
    </div>

    <div style="background: #f8fafc; border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: var(--text-primary);">
        <span>${currentLang === 'ta' ? 'மொத்த தொகை:' : 'Total Value:'}</span>
        <span style="color: var(--primary-color);">₹${grandTotal.toLocaleString('en-IN')}</span>
      </div>
    </div>

    <div class="form-group">
      <label>Ordering Account</label>
      <div style="background: var(--primary-light); border: 1px solid #a7f3d0; padding: 10px 14px; border-radius: var(--radius-sm); font-weight: 700; color: var(--primary-color); font-size: 14px;">
        ${activeCustName} (${activeCust.phone})
      </div>
    </div>

    <div class="form-group">
      <label>${t('fulfillmentLabel')}</label>
      <div class="cart-fulfillment-options" style="display: flex; gap: 10px; margin-top: 4px;">
        <label style="flex: 1; border: 1px solid var(--border-color); padding: 10px; border-radius: var(--radius-sm); cursor: pointer; background: var(--bg-card); text-align: center; font-size: 12px; font-weight: 600;">
          <input type="radio" name="fulfillment" value="PICKUP" checked onchange="toggleDeliveryAddressField()">
          ${t('pickupOption')}
        </label>
        <label style="flex: 1; border: 1px solid var(--border-color); padding: 10px; border-radius: var(--radius-sm); cursor: pointer; background: var(--bg-card); text-align: center; font-size: 12px; font-weight: 600;">
          <input type="radio" name="fulfillment" value="DELIVERY" onchange="toggleDeliveryAddressField()">
          ${t('deliveryOption')}
        </label>
      </div>
    </div>

    <div class="form-group" id="deliveryAddressGroup" style="display: none;">
      <label>${t('farmAddressLabel')}</label>
      <input type="text" id="deliveryAddressInput" class="form-control" placeholder="${t('farmAddressPlaceholder')}">
    </div>

    <div class="form-group">
      <label>${t('paymentChoiceLabel')}</label>
      <select id="cartPaymentChoice" class="form-control">
        <option value="PAY_LATER">${t('payLaterOption')}</option>
        <option value="ONLINE">${t('payNowOption')}</option>
      </select>
    </div>

    <!-- Form-Level Reservation & Refund Consent -->
    <div class="form-consent-box">
      <input type="checkbox" id="orderConsentCheck" required checked>
      <label for="orderConsentCheck">
        ${currentLang === 'ta' ? 'முன்பதிவை உறுதிசெய்து, <a href="#" onclick="openPolicyModal(\'refund\'); return false;">திரும்பப்பெறும் கொள்கை</a> மற்றும் கடன் கணக்கு விதிமுறைகளுக்கு சம்மதிக்கிறேன்.' : 'I confirm this reservation, accept the <a href="#" onclick="openPolicyModal(\'refund\'); return false;">Refund & Return Policy</a>, and authorize ledger accounting.'}
      </label>
    </div>

    <button class="btn-primary" onclick="submitCustomerOrder()">${t('confirmOrderBtn')}</button>
  `;
}

function toggleDeliveryAddressField() {
  const isDelivery = document.querySelector('input[name="fulfillment"]:checked').value === 'DELIVERY';
  document.getElementById('deliveryAddressGroup').style.display = isDelivery ? 'block' : 'none';
}

function submitCustomerOrder() {
  if (cart.length === 0) return;

  const cust = customers[loggedInCustomerIndex];
  if (!cust) return;

  const fulfillment = document.querySelector('input[name="fulfillment"]:checked').value;
  const address = fulfillment === 'DELIVERY' ? document.getElementById('deliveryAddressInput').value.trim() : 'Shop Counter Pickup';
  const paymentChoice = document.getElementById('cartPaymentChoice').value;

  const consentCheck = document.getElementById('orderConsentCheck');
  if (consentCheck && !consentCheck.checked) {
    alert(currentLang === 'ta' ? 'தயவுசெய்து முன்பதிவு மற்றும் திரும்பப்பெறும் கொள்கையை ஏற்கவும்!' : 'Please agree to the Reservation & Refund Policy to confirm.');
    consentCheck.focus();
    return;
  }

  if (fulfillment === 'DELIVERY' && !address) {
    alert(currentLang === 'ta' ? 'தயவுசெய்து டெலிவரி முகவரியை உள்ளிடவும்!' : 'Please enter delivery address!');
    return;
  }

  let totalOrderAmt = 0;
  const orderItems = cart.map(cItem => {
    const p = products.find(prod => prod.id === cItem.productId);
    const itemTotal = p.price * cItem.qty;
    totalOrderAmt += itemTotal;
    p.stock -= cItem.qty;

    return {
      productId: p.id,
      name: p.name,
      nameTa: p.nameTa,
      qty: cItem.qty,
      unitPrice: p.price,
      total: itemTotal
    };
  });

  const ordId = 'ORD-2026-' + String(Math.floor(500 + Math.random() * 500));
  const newOrder = {
    orderId: ordId,
    customerName: cust.name,
    customerNameTa: cust.nameTa,
    customerPhone: cust.phone,
    customerVillage: cust.village,
    date: new Date().toISOString().replace('T', ' ').substring(0, 16),
    fulfillmentType: fulfillment,
    deliveryAddress: address,
    items: orderItems,
    totalAmount: totalOrderAmt,
    paymentChoice: paymentChoice,
    status: 'ORDER_PLACED',
    notes: fulfillment === 'PICKUP' ? 'Shop Pickup' : `Delivery: ${address}`
  };

  orders.unshift(newOrder);
  cart = [];
  saveData();
  closeCartModal();

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
  addNotification(
    'ORDER_UPDATE',
    `New Order ${ordId}`,
    `${cName} placed order ${ordId} for ₹${totalOrderAmt}.`,
    fulfillment === 'PICKUP' ? '' : '',
    cust.phone,
    `புதிய ஆர்டர் ${ordId}`,
    `${cName} ஆர்டர் ${ordId} கொடுத்துள்ளார் (தொகை ₹${totalOrderAmt}).`
  );

  showToast(
    currentLang === 'ta' ? 'ஆர்டர் உறுதி செய்யப்பட்டது!' : 'Order Placed!',
    `Order ${ordId} reserved.`,
    ''
  );

  renderAll();
  setActiveTab('tabOrders');
}

// ----------------------------------------------------
// Customer Orders Tab (PRIVACY PROTECTED)
// ----------------------------------------------------
function renderCustomerOrders() {
  const container = document.getElementById('customerOrdersContainer');
  const cust = customers[loggedInCustomerIndex];
  if (!cust) return;

  const custOrders = orders.filter(o => o.customerName === cust.name || o.customerPhone === cust.phone);

  if (custOrders.length === 0) {
    const showOrdersForText = currentAuthRole === 'admin'
      ? `<p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Showing orders for <strong>${(currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name}</strong>.</p>`
      : '';

    container.innerHTML = `
      <div style="text-align: center; padding: 40px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        
        <h4 style="font-size: 16px; color: var(--text-primary);">${t('noActiveOrders')}</h4>
        ${showOrdersForText}
      </div>
    `;
    return;
  }

  container.innerHTML = custOrders.map(ord => {
    let statusBadge = `<span class="status-badge status-due-soon">${t('stepPlaced')}</span>`;
    if (ord.status === 'PACKED_READY') {
      statusBadge = `<span class="status-badge status-paid">${t('stepPacked')}</span>`;
    } else if (ord.status === 'DISPATCHED') {
      statusBadge = `<span class="status-badge status-paid">${t('stepReady')}</span>`;
    } else if (ord.status === 'COMPLETED') {
      statusBadge = `<span class="status-badge" style="background: var(--bg-card-subtle); color: var(--text-secondary);">${t('stepCompleted')}</span>`;
    }

    const itemsSummary = ord.items.map(i => {
      const iName = (currentLang === 'ta' && i.nameTa) ? i.nameTa : i.name;
      return `${i.qty}x ${iName}`;
    }).join(', ');

    return `
      <div class="order-card" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <h4 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${ord.orderId}</h4>
            <div style="font-size: 12px; color: var(--text-muted);">${ord.date} • ${ord.fulfillmentType === 'PICKUP' ? t('pickupOption') : t('deliveryOption')}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="order-step-tracker" style="display: flex; gap: 8px; margin: 14px 0; background: var(--bg-card-subtle); padding: 12px; border-radius: var(--radius-sm); font-size: 12px;">
          <span style="font-weight: 600; color: ${ord.status === 'ORDER_PLACED' ? 'var(--warning-color)' : 'var(--success-color)'};">${t('stepPlaced')}</span> → 
          <span style="font-weight: 600; color: ${ord.status === 'PACKED_READY' || ord.status === 'DISPATCHED' || ord.status === 'COMPLETED' ? 'var(--success-color)' : 'var(--text-muted)'};">${t('stepPacked')}</span> → 
          <span style="font-weight: 600; color: ${ord.status === 'DISPATCHED' || ord.status === 'COMPLETED' ? 'var(--success-color)' : 'var(--text-muted)'};">${t('stepReady')}</span> → 
          <span style="font-weight: 600; color: ${ord.status === 'COMPLETED' ? 'var(--success-color)' : 'var(--text-muted)'};">${t('stepCompleted')}</span>
        </div>

        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px;">
          <strong>${currentLang === 'ta' ? 'பொருட்கள்:' : 'Items:'}</strong> ${itemsSummary}
        </div>

        <div class="order-card-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px; font-size: 13px;">
          <div>
            <div>${currentLang === 'ta' ? 'முகவரி:' : 'Address:'} <span style="color: var(--text-primary); font-weight: 500;">${ord.deliveryAddress}</span></div>
            <div style="font-size: 11px; margin-top: 4px;">
              ${ord.paymentChoice === 'ONLINE'
                ? `<span style="background: #ecfdf5; color: #047857; padding: 2px 8px; border-radius: 4px; font-weight: 600; border: 1px solid #a7f3d0;">${currentLang === 'ta' ? 'ஆன்லைனில் செலுத்தப்பட்டது' : 'Paid Online'}</span>`
                : `<span style="background: #fffbeb; color: #b45309; padding: 2px 8px; border-radius: 4px; font-weight: 600; border: 1px solid #fde68a;">${currentLang === 'ta' ? 'பிறகு செலுத்துதல் (கடன் கணக்கு)' : 'Pay Later (Store Credit)'}</span>`
              }
            </div>
          </div>
          <div style="font-size: 16px; font-weight: 700; color: var(--primary-color);">Total: ₹${ord.totalAmount.toLocaleString('en-IN')}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// Customer Ledger (PRIVACY PROTECTED)
// ----------------------------------------------------
function renderCustomerLedger() {
  const cust = customers[loggedInCustomerIndex];
  if (!cust) return;

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
  const cVillage = (currentLang === 'ta' && cust.villageTa) ? cust.villageTa : cust.village;
  const cLand = (currentLang === 'ta' && cust.landSizeTa) ? cust.landSizeTa : cust.landSize;

  let totalPurchased = 0;
  let totalPaid = 0;
  let totalDue = 0;

  cust.purchases.forEach(p => {
    totalPurchased += p.totalAmount;
    totalPaid += p.paidAmount;
    totalDue += p.balance;
  });

  const ledgerCard = document.getElementById('ledgerHeaderCard');
  ledgerCard.innerHTML = `
    <div class="customer-info-box">
      <h3>${cName}</h3>
      <div class="customer-meta">
        <span><strong>Location / Village:</strong> ${cVillage}</span>
        <span><strong>Mobile:</strong> ${cust.phone}</span>
      </div>
    </div>

    <div class="ledger-summary-grid">
      <div class="ledger-stat-box">
        <div class="ledger-stat-title">${t('totalPurchases')}</div>
        <div class="ledger-stat-value val-total">₹${totalPurchased.toLocaleString('en-IN')}</div>
      </div>
      <div class="ledger-stat-box">
        <div class="ledger-stat-title">${t('amountPaid')}</div>
        <div class="ledger-stat-value val-paid">₹${totalPaid.toLocaleString('en-IN')}</div>
      </div>
      <div class="ledger-stat-box highlight-due">
        <div class="ledger-stat-title">${t('dueBalance')}</div>
        <div class="ledger-stat-value val-due">₹${totalDue.toLocaleString('en-IN')}</div>
      </div>
    </div>

    ${totalDue > 0 ? `
      <button class="btn-pay-now" onclick="openPaymentModal(${loggedInCustomerIndex})">
        ${t('payOnlineBtn')}
      </button>
    ` : `
      <div style="background: var(--success-bg); border: 1px solid #bbf7d0; padding: 10px 16px; border-radius: var(--radius-sm); color: var(--success-color); font-weight: 600; font-size: 13px;">
        ${currentLang === 'ta' ? 'அனைத்து நிலுவையும் செலுத்தப்பட்டுவிட்டது!' : 'All Bills Paid! No Balance Due'}
      </div>
    `}
  `;

  const tbody = document.getElementById('ledgerTableBody');
  if (!cust.purchases || cust.purchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;">No purchase invoices for this account yet.</td></tr>`;
    return;
  }

  // Sort: Bills with unpaid balance FIRST (1st), Zero balance (paid) bills LAST
  const sortedInvoices = [...cust.purchases].sort((a, b) => {
    const isZeroA = a.balance === 0 ? 1 : 0;
    const isZeroB = b.balance === 0 ? 1 : 0;

    // Primary sort: Unpaid balance (isZero = 0) FIRST, Zero balance (isZero = 1) LAST
    if (isZeroA !== isZeroB) {
      return isZeroA - isZeroB;
    }

    // Secondary sort: Product purchase order (newest date first)
    const dateA = new Date(a.date || 0).getTime();
    const dateB = new Date(b.date || 0).getTime();
    return dateB - dateA;
  });

  tbody.innerHTML = sortedInvoices.map(inv => {
    let statusClass = 'status-paid';
    let statusText = t('statusPaid');
    if (inv.balance > 0) {
      statusClass = 'status-due-soon';
      statusText = currentLang === 'ta' ? 'நிலுவை' : 'DUE';
    }

    const itemsSummary = inv.items.map(item => {
      const iName = (currentLang === 'ta' && item.nameTa) ? item.nameTa : item.name;
      return `${item.qty}x ${iName}`;
    }).join(', ');

    return `
      <tr>
        <td><strong>${inv.invoiceId}</strong></td>
        <td>${inv.date}</td>
        <td><span style="color: var(--text-primary); font-weight: 500;">${itemsSummary}</span></td>
        <td>₹${inv.totalAmount.toLocaleString('en-IN')}</td>
        <td style="color: var(--success-color);">₹${inv.paidAmount.toLocaleString('en-IN')}</td>
        <td style="color: var(--warning-color); font-weight: 700;">₹${inv.balance.toLocaleString('en-IN')}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          ${inv.balance > 0 ? `
            <button class="btn-action" onclick="openPaymentModal(${loggedInCustomerIndex})">${t('payBillBtn')}</button>
          ` : `
            <span style="font-size: 12px; color: var(--text-muted);">${t('clearedLabel')}</span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function printLedgerReceipt() {
  const cust = customers[loggedInCustomerIndex];
  if (!cust) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert(currentLang === 'ta' ? 'அறிக்கை அச்சிட பாப்அப் (Pop-up) அனுமதியை வழங்கவும்.' : 'Please allow pop-ups in your browser to print the statement.');
    return;
  }

  let totalDue = cust.purchases ? cust.purchases.reduce((acc, p) => acc + p.balance, 0) : 0;
  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
  const purchasesList = cust.purchases || [];

  const tableRows = purchasesList.length === 0
    ? `<tr><td colspan="6" style="text-align: center; padding: 16px;">No purchase records found.</td></tr>`
    : purchasesList.map(p => `
      <tr>
        <td><strong>${p.invoiceId}</strong></td>
        <td>${p.date}</td>
        <td>${p.items ? p.items.map(i => `${i.qty}x ${(currentLang === 'ta' && i.nameTa) ? i.nameTa : i.name}`).join(', ') : 'Items'}</td>
        <td>₹${p.totalAmount.toLocaleString('en-IN')}</td>
        <td style="color: #059669;">₹${p.paidAmount.toLocaleString('en-IN')}</td>
        <td class="due">₹${p.balance.toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

  printWindow.document.write(`
    <html>
    <head>
      <title>Statement - ${cName}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; line-height: 1.6; color: #0f172a; max-width: 800px; margin: 0 auto; }
        h2 { color: #0f766e; margin-bottom: 4px; }
        .sub { color: #64748b; font-size: 14px; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
        th { background: #f1f5f9; font-weight: 700; }
        .due { color: #dc2626; font-weight: bold; }
        .summary-box { margin-top: 24px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
      </style>
    </head>
    <body>
      <h2>KisanAgri Hub</h2>
      <p class="sub">Agro Chemical & Fertilizer Store — Customer Account Statement</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
      <p><strong>Farmer Name:</strong> ${cName} &nbsp;|&nbsp; <strong>Mobile:</strong> ${cust.phone}<br>
      <strong>Location / Village:</strong> ${cust.village || 'N/A'}<br>
      <strong>Date of Statement:</strong> ${new Date().toLocaleDateString()}</p>
      
      <table>
        <thead>
          <tr>
            <th>Invoice #</th><th>Date</th><th>Purchased Items</th><th>Total (₹)</th><th>Paid (₹)</th><th>Balance (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="summary-box">
        <span style="font-size: 15px; font-weight: 600;">Outstanding Store Credit Due:</span>
        <span class="due" style="font-size: 20px;">₹${totalDue.toLocaleString('en-IN')}</span>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

// ----------------------------------------------------
// Shop Owner View (Admin Access)
// ----------------------------------------------------
function renderOwnerOrders() {
  const container = document.getElementById('ownerOrdersContainer');
  const activeOrders = orders.filter(o => o.status !== 'COMPLETED');

  if (activeOrders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
        ${currentLang === 'ta' ? ' அனைத்து ஆர்டர்களும் பேக் செய்யப்பட்டு முடிந்தது!' : ' All customer orders have been packed and fulfilled!'}
      </div>
    `;
    return;
  }

  container.innerHTML = activeOrders.map(ord => {
    const itemsSummary = ord.items.map(i => {
      const iName = (currentLang === 'ta' && i.nameTa) ? i.nameTa : i.name;
      return `${i.qty}x ${iName}`;
    }).join(', ');

    const cName = (currentLang === 'ta' && ord.customerNameTa) ? ord.customerNameTa : ord.customerName;

    return `
      <div class="owner-order-card" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <strong style="font-size: 15px; color: var(--text-primary);">${ord.orderId}</strong>
            <span class="status-badge ${ord.status === 'PACKED_READY' ? 'status-paid' : 'status-due-soon'}">${ord.status.replace('_', ' ')}</span>
            <span style="font-size: 12px; font-weight: 600; color: var(--primary-color);">${ord.fulfillmentType === 'PICKUP' ? 'Shop Pickup' : 'Farm Delivery'}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
            <strong>${currentLang === 'ta' ? 'வாடிக்கையாளர்:' : 'Customer:'}</strong> ${cName} (${ord.customerPhone})
          </div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            <strong>${currentLang === 'ta' ? 'பொருட்கள்:' : 'Items:'}</strong> ${itemsSummary} • <strong>Total:</strong> ₹${ord.totalAmount.toLocaleString('en-IN')}
          </div>
          <div style="font-size: 11px; margin-top: 4px;">
            ${ord.paymentChoice === 'ONLINE'
              ? `<span style="background: #ecfdf5; color: #047857; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #a7f3d0;">${currentLang === 'ta' ? 'ஆன்லைன் செலுத்துகை (Pre-paid)' : 'Pre-paid Online'}</span>`
              : `<span style="background: #fffbeb; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #fde68a;">${currentLang === 'ta' ? 'கடன் கணக்கில் சேரும்' : 'Pay Later (Credit Tab)'}</span>`
            }
          </div>
        </div>

        <div class="owner-order-actions" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          ${ord.status === 'ORDER_PLACED' ? `
            <button class="btn-primary" style="padding: 8px 14px; font-size: 12px;" onclick="markOrderPacked('${ord.orderId}')">
              Mark Packed & Ready
            </button>
          ` : ''}

          ${ord.status === 'PACKED_READY' && ord.fulfillmentType === 'DELIVERY' ? `
            <button class="btn-action" style="background: var(--primary-color); color: white; border: none;" onclick="markOrderOutForDelivery('${ord.orderId}')">
              Dispatch Delivery
            </button>
          ` : ''}

          <button class="btn-action" style="background: var(--success-bg); color: var(--success-color); border: 1px solid #bbf7d0; font-weight: 600;" onclick="completeCustomerOrder('${ord.orderId}')">
            ${ord.paymentChoice === 'ONLINE'
              ? (currentLang === 'ta' ? 'முடிந்தது (முன்செலுத்தப்பட்டது)' : 'Complete Order (Pre-paid)')
              : (currentLang === 'ta' ? 'முடித்து கடனில் சேர்' : 'Complete & Add to Credit Tab')
            }
          </button>
          <button class="btn-action" style="background: var(--danger-bg); color: var(--danger-color); border: 1px solid #fecaca; font-weight: 600;" onclick="deleteOrder('${ord.orderId}')">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function markOrderPacked(orderId) {
  const ord = orders.find(o => o.orderId === orderId);
  if (!ord) return;

  ord.status = 'PACKED_READY';
  saveData();
  renderAll();

  const cName = (currentLang === 'ta' && ord.customerNameTa) ? ord.customerNameTa : ord.customerName;
  addNotification(
    'ORDER_UPDATE',
    `Order ${ord.orderId} Packed!`,
    `${cName}'s order has been packed by shop staff.`,
    '',
    ord.customerPhone,
    `ஆர்டர் ${ord.orderId} பேக் செய்யப்பட்டது!`,
    `${cName} அவர்களின் ஆர்டர் கடை ஊழியர்களால் பேக் செய்யப்பட்டுள்ளது.`
  );

  showToast(currentLang === 'ta' ? 'பேக் செய்யப்பட்டது' : 'Order Packed', `Notified ${cName}`, '');
}

function markOrderOutForDelivery(orderId) {
  const ord = orders.find(o => o.orderId === orderId);
  if (!ord) return;

  ord.status = 'DISPATCHED';
  saveData();
  renderAll();

  addNotification(
    'ORDER_UPDATE',
    `Order ${ord.orderId} Out for Delivery`,
    `Order ${ord.orderId} dispatched to farm address.`,
    '',
    ord.customerPhone,
    `ஆர்டர் ${ord.orderId} டெலிவரிக்கு புறப்பட்டது`,
    `ஆர்டர் ${ord.orderId} பண்ணை முகவரிக்கு அனுப்பப்பட்டுள்ளது.`
  );

  showToast(currentLang === 'ta' ? 'டெலிவரிக்கு புறப்பட்டது' : 'Out for Delivery', `En route to ${ord.customerVillage}`, '');
}

function completeCustomerOrder(orderId) {
  const ord = orders.find(o => o.orderId === orderId);
  if (!ord) return;

  ord.status = 'COMPLETED';

  const cust = customers.find(c => c.name === ord.customerName || c.phone === ord.customerPhone);
  if (cust) {
    const invId = 'INV-2026-' + String(Math.floor(100 + Math.random() * 900));
    const today = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

    cust.purchases.unshift({
      invoiceId: invId,
      date: today,
      dueDate: dueDate,
      items: ord.items.map(i => ({ name: i.name, nameTa: i.nameTa, qty: i.qty, unitPrice: i.unitPrice, total: i.total })),
      totalAmount: ord.totalAmount,
      paidAmount: ord.paymentChoice === 'ONLINE' ? ord.totalAmount : 0,
      balance: ord.paymentChoice === 'ONLINE' ? 0 : ord.totalAmount,
      status: ord.paymentChoice === 'ONLINE' ? 'PAID' : 'DUE_SOON'
    });
  }

  saveData();
  renderAll();

  showToast(currentLang === 'ta' ? 'ஆர்டர் முடிந்தது' : 'Order Completed!', `Order ${ord.orderId} fulfilled.`, '');
}

// ----------------------------------------------------
// Payment Gateway
// ----------------------------------------------------
function openPaymentModal(custIndex) {
  const cust = customers[custIndex];
  if (!cust) return;

  const totalDue = cust.purchases.reduce((acc, p) => acc + p.balance, 0);
  if (totalDue <= 0) {
    showToast('No Balance Due', `${cust.name} has no outstanding bills!`, '');
    return;
  }

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
  document.getElementById('payModalCustName').textContent = cName;
  document.getElementById('payModalCustPhone').textContent = cust.phone;
  document.getElementById('payAmountInput').value = totalDue;
  document.getElementById('payAmountInput').max = totalDue;
  document.getElementById('payModalMaxHint').textContent = `${currentLang === 'ta' ? 'அதிகபட்ச நிலுவை:' : 'Max Balance:'} ₹${totalDue.toLocaleString('en-IN')}`;

  document.getElementById('paymentModal').classList.add('active');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('active');
}

function setPayMethod(method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-opt-btn').forEach(btn => btn.classList.remove('active'));
  
  if (method === 'UPI') {
    document.getElementById('optUpi').classList.add('active');
    document.getElementById('methodUpiView').style.display = 'block';
    document.getElementById('methodCardView').style.display = 'none';
  } else if (method === 'CARD') {
    document.getElementById('optCard').classList.add('active');
    document.getElementById('methodUpiView').style.display = 'none';
    document.getElementById('methodCardView').style.display = 'block';
  } else {
    document.getElementById('optNet').classList.add('active');
    document.getElementById('methodUpiView').style.display = 'none';
    document.getElementById('methodCardView').style.display = 'none';
  }
}

function submitOnlinePayment() {
  const cust = customers[loggedInCustomerIndex];
  if (!cust) return;

  const payAmt = parseFloat(document.getElementById('payAmountInput').value);
  const totalDue = cust.purchases.reduce((acc, p) => acc + p.balance, 0);

  if (isNaN(payAmt) || payAmt <= 0 || payAmt > totalDue) {
    alert('Invalid payment amount!');
    return;
  }

  let remainingPay = payAmt;
  cust.purchases.forEach(inv => {
    if (remainingPay > 0 && inv.balance > 0) {
      const deduct = Math.min(remainingPay, inv.balance);
      inv.paidAmount += deduct;
      inv.balance -= deduct;
      remainingPay -= deduct;

      if (inv.balance === 0) {
        inv.status = 'PAID';
      }
    }
  });

  saveData();
  closePaymentModal();
  renderAll();

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
  showToast(currentLang === 'ta' ? 'பணம் செலுத்தப்பட்டது' : 'Payment Received!', `₹${payAmt} from ${cName}`, '');
}

// ----------------------------------------------------
// Admin Forms & Overdue Dashboard
// ----------------------------------------------------
function populateAdminFormSelects() {
  const custSelect = document.getElementById('billCustomerSelect');
  if (custSelect) {
    const defaultCustOpt = `<option value="" disabled selected>${currentLang === 'ta' ? '-- வாடிக்கையாளரை தேர்ந்தெடுக்கவும் --' : '-- Select Customer Account --'}</option>`;
    const custOpts = customers.map((c, idx) => {
      const cName = (currentLang === 'ta' && c.nameTa) ? c.nameTa : c.name;
      return `<option value="${idx}">${cName} (${c.phone})</option>`;
    }).join('');
    custSelect.innerHTML = defaultCustOpt + custOpts;
  }

  const prodSelect = document.getElementById('billProductSelect');
  if (prodSelect) {
    const defaultProdOpt = `<option value="" disabled selected>${currentLang === 'ta' ? '-- உரம் / மருந்தை தேர்ந்தெடுக்கவும் --' : '-- Select Fertilizer or Chemical Product --'}</option>`;
    const prodOpts = products.map((p, idx) => {
      const pName = (currentLang === 'ta' && p.nameTa) ? p.nameTa : p.name;
      return `<option value="${idx}">${pName} - ₹${p.price} (Stock: ${p.stock})</option>`;
    }).join('');
    prodSelect.innerHTML = defaultProdOpt + prodOpts;
  }

  const upfrontInput = document.getElementById('billUpfrontInput');
  if (upfrontInput) {
    upfrontInput.value = '';
  }

  calculateBillPreview();
}

function onOfflineCustChange() {
  const prodSelect = document.getElementById('billProductSelect');
  const qtyInput = document.getElementById('billQtyInput');
  const upfrontInput = document.getElementById('billUpfrontInput');

  if (prodSelect && prodSelect.value !== '' && upfrontInput) {
    const prodIdx = parseInt(prodSelect.value, 10);
    const qty = parseInt(qtyInput ? qtyInput.value : '1', 10) || 1;
    const prod = products[prodIdx];
    if (prod) {
      upfrontInput.value = prod.price * qty;
    }
  }
  calculateBillPreview();
}

function onOfflineProdChange() {
  const prodSelect = document.getElementById('billProductSelect');
  const qtyInput = document.getElementById('billQtyInput');
  const upfrontInput = document.getElementById('billUpfrontInput');

  if (prodSelect && prodSelect.value !== '' && upfrontInput) {
    const prodIdx = parseInt(prodSelect.value, 10);
    const qty = parseInt(qtyInput ? qtyInput.value : '1', 10) || 1;
    const prod = products[prodIdx];
    if (prod) {
      upfrontInput.value = prod.price * qty;
    }
  }
  calculateBillPreview();
}

function calculateBillPreview() {
  const custSelect = document.getElementById('billCustomerSelect');
  const prodSelect = document.getElementById('billProductSelect');
  const qtyInput = document.getElementById('billQtyInput');
  const upfrontInput = document.getElementById('billUpfrontInput');

  const totalElem = document.getElementById('billPreviewTotal');
  const prevDueElem = document.getElementById('billPreviewPrevDue');
  const maxPayableElem = document.getElementById('billPreviewMaxPayable');
  const balanceElem = document.getElementById('billPreviewBalance');
  const hintElem = document.getElementById('billUpfrontHint');

  const hasCust = custSelect && custSelect.value !== '';
  const hasProd = prodSelect && prodSelect.value !== '';

  const custIdx = hasCust ? parseInt(custSelect.value, 10) : -1;
  const prodIdx = hasProd ? parseInt(prodSelect.value, 10) : -1;
  const qty = parseInt(qtyInput ? qtyInput.value : '1', 10) || 1;

  const cust = custIdx >= 0 ? customers[custIdx] : null;
  const prod = prodIdx >= 0 ? products[prodIdx] : null;

  const currentTotal = prod ? (prod.price * qty) : 0;
  const existingDue = cust ? (cust.purchases ? cust.purchases.reduce((acc, p) => acc + (p.balance || 0), 0) : 0) : 0;
  const maxPayable = currentTotal + existingDue;

  if (upfrontInput) {
    upfrontInput.max = maxPayable;

    let upfront = parseFloat(upfrontInput.value || '0');
    if (isNaN(upfront) || upfront < 0) upfront = 0;

    if (upfront > maxPayable && maxPayable > 0) {
      upfront = maxPayable;
      upfrontInput.value = maxPayable;
    }

    let addedToBalance = 0;
    if (upfront <= currentTotal) {
      addedToBalance = currentTotal - upfront;
    } else {
      addedToBalance = 0;
    }

    if (totalElem) totalElem.textContent = `₹${currentTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (prevDueElem) prevDueElem.textContent = `₹${existingDue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (maxPayableElem) maxPayableElem.textContent = `₹${maxPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (balanceElem) balanceElem.textContent = `₹${addedToBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (hintElem) hintElem.textContent = `${currentLang === 'ta' ? 'அதிகபட்சம்:' : 'Max Allowed:'} ₹${maxPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${currentLang === 'ta' ? 'பில்' : 'Current'} ₹${currentTotal} + ${currentLang === 'ta' ? 'பழைய கடன்' : 'Prev Due'} ₹${existingDue})`;
  }
}

function handleLogOfflineBill(e) {
  e.preventDefault();
  const custSelect = document.getElementById('billCustomerSelect');
  const prodSelect = document.getElementById('billProductSelect');
  const qtyInput = document.getElementById('billQtyInput');
  const upfrontInput = document.getElementById('billUpfrontInput');

  if (!custSelect || custSelect.value === '') {
    alert(currentLang === 'ta' ? 'தயவுசெய்து ஒரு வாடிக்கையாளரை தேர்ந்தெடுக்கவும்.' : 'Please select a customer account.');
    return;
  }

  if (!prodSelect || prodSelect.value === '') {
    alert(currentLang === 'ta' ? 'தயவுசெய்து ஒரு உரம் அல்லது மருந்தை தேர்ந்தெடுக்கவும்.' : 'Please select a fertilizer or chemical product.');
    return;
  }

  const custIdx = parseInt(custSelect.value, 10);
  const prodIdx = parseInt(prodSelect.value, 10);
  const qty = parseInt(qtyInput ? qtyInput.value : '1', 10);
  if (isNaN(qty) || qty <= 0) {
    alert(currentLang === 'ta' ? 'தயவுசெய்து சரியான எண்ணிக்கையை உள்ளிடவும் (குறைந்தது 1).' : 'Please enter a valid quantity (minimum 1).');
    return;
  }

  const cust = customers[custIdx];
  const prod = products[prodIdx];

  if (!cust || !prod) return;

  if (prod.stock < qty) {
    const pName = (currentLang === 'ta' && prod.nameTa) ? prod.nameTa : prod.name;
    alert(currentLang === 'ta' ? `இருப்பு பற்றாக்குறை! ${pName} கையிருப்பு: ${prod.stock}` : `Insufficient stock for ${pName}! Stock remaining: ${prod.stock}`);
    return;
  }

  const currentTotal = prod.price * qty;
  const existingDue = cust.purchases ? cust.purchases.reduce((acc, p) => acc + (p.balance || 0), 0) : 0;
  const maxPayable = currentTotal + existingDue;

  let upfront = parseFloat(upfrontInput ? upfrontInput.value : '0') || 0;
  if (upfront > maxPayable) {
    upfront = maxPayable;
  }

  prod.stock -= qty;

  const upfrontForCurrentBill = Math.min(upfront, currentTotal);
  const currentBillBalance = Math.max(0, currentTotal - upfrontForCurrentBill);
  const excessForPrevDues = Math.max(0, upfront - currentTotal);

  const invId = 'INV-2026-' + String(Math.floor(100 + Math.random() * 900));
  const today = new Date().toISOString().split('T')[0];
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];

  cust.purchases.unshift({
    invoiceId: invId,
    date: today,
    dueDate: dueDate,
    items: [
      { name: prod.name, nameTa: prod.nameTa || prod.name, qty: qty, unitPrice: prod.price, total: currentTotal }
    ],
    totalAmount: currentTotal,
    paidAmount: upfrontForCurrentBill,
    balance: currentBillBalance,
    status: currentBillBalance === 0 ? 'PAID' : 'DUE_SOON'
  });

  if (excessForPrevDues > 0) {
    let remExcess = excessForPrevDues;
    cust.purchases.forEach((inv, index) => {
      if (index === 0) return;
      if (remExcess > 0 && inv.balance > 0) {
        const deduct = Math.min(remExcess, inv.balance);
        inv.paidAmount += deduct;
        inv.balance -= deduct;
        remExcess -= deduct;
        if (inv.balance <= 0) {
          inv.status = 'PAID';
        }
      }
    });
  }

  const finalCustomerDue = cust.purchases.reduce((acc, p) => acc + (p.balance || 0), 0);
  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;

  addNotification(
    'OFFLINE_BILL',
    `New Offline Purchase Bill (${invId})`,
    `Shop owner logged bill ${invId} for your account. Purchase Total: ₹${currentTotal.toLocaleString('en-IN')}, Upfront Paid: ₹${upfront.toLocaleString('en-IN')}. Remaining Total Due: ₹${finalCustomerDue.toLocaleString('en-IN')}.`,
    '',
    cust.phone,
    `புதிய கடை பில் (${invId})`,
    `கடை உரிமையாளர் உங்கள் கணக்கில் ${invId} பில் பதிவு செய்துள்ளார். பில் தொகை: ₹${currentTotal.toLocaleString('en-IN')}, செலுத்தப்பட்டது: ₹${upfront.toLocaleString('en-IN')}. மீதமுள்ள மொத்த கடன்: ₹${finalCustomerDue.toLocaleString('en-IN')}.`
  );

  populateAdminFormSelects();

  saveData();
  renderAll();

  showToast(
    currentLang === 'ta' ? 'பில் உருவாக்கப்பட்டது' : 'Bill Logged Successfully',
    `${invId} logged for ${cName}. Remaining Due: ₹${finalCustomerDue.toLocaleString('en-IN')}`,
    ''
  );
}

function renderOverdueTable() {
  const tbody = document.getElementById('overdueTableBody');
  if (!tbody) return;

  // Filter out customers with zero Total Purchases, then sort: Pending Credit customers FIRST, Clear customers LAST
  const customersWithPurchases = customers.map((cust, originalIndex) => ({ ...cust, originalIndex }))
    .filter(cust => {
      if (!cust.purchases || !Array.isArray(cust.purchases)) return false;
      const tot = cust.purchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
      return tot > 0;
    })
    .sort((a, b) => {
      const dueA = (a.purchases && Array.isArray(a.purchases)) ? a.purchases.reduce((acc, p) => acc + (p.balance || 0), 0) : 0;
      const dueB = (b.purchases && Array.isArray(b.purchases)) ? b.purchases.reduce((acc, p) => acc + (p.balance || 0), 0) : 0;

      const isClearA = dueA === 0 ? 1 : 0;
      const isClearB = dueB === 0 ? 1 : 0;

      // Primary sort: Pending Credit customers (isClear = 0) FIRST, Clear customers (isClear = 1) LAST
      if (isClearA !== isClearB) {
        return isClearA - isClearB;
      }

      // Secondary sort: Alphabetical A-Z by name within each group
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  if (customersWithPurchases.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">${currentLang === 'ta' ? 'கொள்முதல் வரலாறு உள்ள வாடிக்கையாளர்கள் இல்லை.' : 'No customers with purchase history found.'}</td></tr>`;
    return;
  }

  tbody.innerHTML = customersWithPurchases.map(cust => {
    const idx = cust.originalIndex;
    let totalPurchases = 0;
    let unpaidDue = 0;

    cust.purchases.forEach(p => {
      totalPurchases += p.totalAmount;
      unpaidDue += p.balance;
    });

    let statusBadge = `<span class="status-badge status-paid">${currentLang === 'ta' ? 'முடிந்தது' : 'Clear'}</span>`;
    if (unpaidDue > 0) {
      statusBadge = `<span class="status-badge status-due-soon">${currentLang === 'ta' ? 'நிலுவை தொகை' : 'Pending Credit'}</span>`;
    }

    const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
    const cVillage = (currentLang === 'ta' && cust.villageTa) ? cust.villageTa : cust.village;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayRemindersCount = cust.remindersSent ? cust.remindersSent.filter(r => r.date === todayStr).length : 0;

    return `
      <tr>
        <td><strong>${cName}</strong></td>
        <td>${cust.phone}</td>
        <td>${cVillage}</td>
        <td>₹${totalPurchases.toLocaleString('en-IN')}</td>
        <td style="color: var(--warning-color); font-weight: 700;">₹${unpaidDue.toLocaleString('en-IN')}</td>
        <td>${statusBadge}</td>
        <td><span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">${todayRemindersCount}</span></td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 6px; align-items: stretch; min-width: 190px;">
            ${unpaidDue > 0 ? `
              <button type="button" class="btn-action" style="background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; font-weight: 700; font-size: 12px; padding: 7px 12px; width: 100%; text-align: center; border-radius: var(--radius-sm); box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2); cursor: pointer;" onclick="openAdminRecordPaymentModal(${idx})">
                ${currentLang === 'ta' ? 'பணம் பெறப்பட்டது' : 'Mark Paid / Cash'}
              </button>
              <div style="display: flex; gap: 4px; width: 100%;">
                <button type="button" class="btn-action btn-reminder" style="flex: 1; padding: 5px 0; text-align: center; font-size: 11px; font-weight: 600; cursor: pointer;" onclick="sendReminderSMS(${idx})">SMS</button>
                <button type="button" class="btn-action btn-reminder" style="flex: 1; padding: 5px 0; text-align: center; font-size: 11px; font-weight: 600; cursor: pointer;" onclick="triggerInAppReminder(${idx})">App</button>
                <button type="button" class="btn-action btn-reminder" style="flex: 1; padding: 5px 0; text-align: center; font-size: 11px; font-weight: 600; cursor: pointer;" onclick="sendReminderWhatsApp(${idx})">WA</button>
              </div>
            ` : `
              <span style="font-size: 12px; color: var(--success-color); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; padding: 4px 0;">
                ${currentLang === 'ta' ? 'முடிந்தது' : 'Paid'}
              </span>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Admin Offline Cash Payment Handlers
function openAdminRecordPaymentModal(custIndex) {
  let idx = parseInt(custIndex, 10);
  if (isNaN(idx)) {
    idx = customers.findIndex(c => c.phone.trim() === String(custIndex).trim());
  }

  const cust = customers[idx];
  if (!cust) return;

  const totalDue = cust.purchases ? cust.purchases.reduce((acc, p) => acc + p.balance, 0) : 0;
  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;
  const cVillage = (currentLang === 'ta' && cust.villageTa) ? cust.villageTa : cust.village;

  const idxInput = document.getElementById('adminPayCustIndex');
  const namePhoneElem = document.getElementById('adminPayCustNamePhone');
  const villageElem = document.getElementById('adminPayCustVillage');
  const dueElem = document.getElementById('adminPayCustCurrentDue');
  const amtInput = document.getElementById('adminCashAmountInput');
  const modal = document.getElementById('adminRecordPaymentModal');

  if (idxInput) idxInput.value = idx;
  if (namePhoneElem) namePhoneElem.textContent = `${cName} (${cust.phone})`;
  if (villageElem) villageElem.textContent = `Location / Village: ${cVillage}`;
  if (dueElem) dueElem.textContent = `Current Unpaid Due: ₹${totalDue.toLocaleString('en-IN')}`;
  if (amtInput) amtInput.value = totalDue > 0 ? totalDue : '';

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closeAdminPaymentModal() {
  const modal = document.getElementById('adminRecordPaymentModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function handleAdminSubmitOfflinePayment(e) {
  e.preventDefault();
  const idx = parseInt(document.getElementById('adminPayCustIndex').value, 10);
  const payAmt = parseFloat(document.getElementById('adminCashAmountInput').value);
  const note = document.getElementById('adminCashNoteInput').value.trim() || 'Paid in hand at shop (Cash)';

  const cust = customers[idx];
  if (!cust || isNaN(payAmt) || payAmt <= 0) return;

  const currentTotalDue = cust.purchases ? cust.purchases.reduce((acc, p) => acc + (p.balance || 0), 0) : 0;
  if (currentTotalDue <= 0) {
    alert(currentLang === 'ta' ? 'இந்த வாடிக்கையாளருக்கு நிலுவை எதுவும் இல்லை!' : 'This customer has no unpaid balance due!');
    return;
  }

  if (payAmt > currentTotalDue) {
    alert(currentLang === 'ta' ? `நிலுவைத் தொகையை விட அதிக பணம் உள்ளிடப்பட்டது! அதிகபட்சம்: ₹${currentTotalDue.toLocaleString('en-IN')}` : `Payment amount exceeds current total due! Maximum allowed: ₹${currentTotalDue.toLocaleString('en-IN')}`);
    return;
  }

  let remainingToApply = payAmt;
  cust.purchases.forEach(inv => {
    if (inv.balance > 0 && remainingToApply > 0) {
      const deduction = Math.min(inv.balance, remainingToApply);
      inv.paidAmount += deduction;
      inv.balance -= deduction;
      remainingToApply -= deduction;

      if (inv.balance <= 0) {
        inv.status = 'PAID';
      }
    }
  });

  const totalRemainingDue = cust.purchases.reduce((acc, p) => acc + p.balance, 0);
  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;

  // Add Notification dispatched directly to customer's account phone
  addNotification(
    'PAYMENT_RECEIVED',
    `Cash Payment Recorded (₹${payAmt.toLocaleString('en-IN')})`,
    `Shop owner recorded cash payment of ₹${payAmt.toLocaleString('en-IN')} for your account. Remaining balance: ₹${totalRemainingDue.toLocaleString('en-IN')}. Note: ${note}`,
    '',
    cust.phone,
    `பணம் பெறப்பட்டது (₹${payAmt.toLocaleString('en-IN')})`,
    `கடை உரிமையாளர் உங்கள் கணக்கில் ₹${payAmt.toLocaleString('en-IN')} பெற்றதாக பதிவு செய்தார். மீதமுள்ள பாக்கி: ₹${totalRemainingDue.toLocaleString('en-IN')}.`
  );

  saveData();
  closeAdminPaymentModal();
  renderAll();

  showToast(
    currentLang === 'ta' ? 'பணம் பெறப்பட்டது!' : 'Cash Payment Recorded!',
    `Recorded ₹${payAmt.toLocaleString('en-IN')} cash from ${cName}. Remaining due: ₹${totalRemainingDue.toLocaleString('en-IN')}.`,
    ''
  );
}

// Reminders (Rate-limited to 1 per day per action channel)
function checkReminderSentToday(cust, channelName) {
  const todayStr = new Date().toISOString().split('T')[0];
  cust.remindersSent = cust.remindersSent || [];
  return cust.remindersSent.some(r => r.date === todayStr && r.channel === channelName);
}

function sendReminderWhatsApp(custIndex) {
  const cust = customers[custIndex];
  if (!cust) return;

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;

  if (checkReminderSentToday(cust, 'WhatsApp')) {
    alert(currentLang === 'ta' ?
      `இன்று வாட்ஸ்அப் நினைவூட்டல் ஏற்கனவே ${cName} என்பவருக்கு அனுப்பப்பட்டுவிட்டது! (ஒரு நாளைக்கு 1 முறை மட்டுமே அனுமதிக்கப்படும்).` :
      `WhatsApp reminder has already been sent to ${cName} today! (Limit: Once per day per action).`
    );
    return;
  }

  const totalDue = cust.purchases.reduce((acc, p) => acc + p.balance, 0);
  const msg = currentLang === 'ta' ? 
    `அன்பார்ந்த ${cName}, கிசான் அக்ரி கடையில் உங்கள் உரம் மற்றும் மருந்து கடன் பாக்கி ₹${totalDue.toLocaleString('en-IN')}. தயவுசெய்து ஆன்லைனில் அல்லது கடையில் செலுத்தவும்.` :
    `Dear ${cName}, payment reminder from KisanAgri Shop: Your fertilizer credit balance is ₹${totalDue.toLocaleString('en-IN')}. Please pay online or at store.`;
  
  cust.remindersSent.push({ date: new Date().toISOString().split('T')[0], channel: "WhatsApp", message: msg });

  // Notification for Admin View
  addNotification(
    'REMINDER_SENT',
    'Payment Reminder Sent',
    `You have sent a reminder to ${cName} to pay the bill`,
    '',
    null,
    'நினைவூட்டல் அனுப்பப்பட்டது',
    `நீங்கள் ${cName} என்பவருக்கு பில் செலுத்த நினைவூட்டல் அனுப்பியுள்ளீர்கள்`
  );

  saveData();
  renderOverdueTable();

  showToast(currentLang === 'ta' ? 'வாட்ஸ்அப் நினைவூட்டல் அனுப்பப்பட்டது' : 'WhatsApp Reminder Sent!', `Notified ${cName}`, '');
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function sendReminderSMS(custIndex) {
  const cust = customers[custIndex];
  if (!cust) return;

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;

  if (checkReminderSentToday(cust, 'SMS')) {
    alert(currentLang === 'ta' ?
      `இன்று எஸ்.எம்.எஸ் நினைவூட்டல் ஏற்கனவே ${cName} என்பவருக்கு அனுப்பப்பட்டுவிட்டது! (ஒரு நாளைக்கு 1 முறை மட்டுமே அனுமதிக்கப்படும்).` :
      `SMS reminder has already been sent to ${cName} today! (Limit: Once per day per action).`
    );
    return;
  }

  const totalDue = cust.purchases.reduce((acc, p) => acc + p.balance, 0);

  cust.remindersSent.push({ date: new Date().toISOString().split('T')[0], channel: "SMS", message: `Due ₹${totalDue}` });

  // Notification for Admin View
  addNotification(
    'REMINDER_SENT',
    'Payment Reminder Sent',
    `You have sent a reminder to ${cName} to pay the bill`,
    '',
    null,
    'நினைவூட்டல் அனுப்பப்பட்டது',
    `நீங்கள் ${cName} என்பவருக்கு பில் செலுத்த நினைவூட்டல் அனுப்பியுள்ளீர்கள்`
  );

  saveData();
  renderOverdueTable();

  showToast(currentLang === 'ta' ? 'எஸ்.எம்.எஸ் அனுப்பப்பட்டது' : 'SMS Sent!', `Notified ${cName}`, '');
}

function triggerInAppReminder(custIndex) {
  const cust = customers[custIndex];
  if (!cust) return;

  const cName = (currentLang === 'ta' && cust.nameTa) ? cust.nameTa : cust.name;

  if (checkReminderSentToday(cust, 'In-App')) {
    alert(currentLang === 'ta' ?
      `இன்று அறிவிப்பு நினைவூட்டல் ஏற்கனவே ${cName} என்பவருக்கு அனுப்பப்பட்டுவிட்டது! (ஒரு நாளைக்கு 1 முறை மட்டுமே அனுமதிக்கப்படும்).` :
      `In-App reminder has already been sent to ${cName} today! (Limit: Once per day per action).`
    );
    return;
  }

  const totalDue = cust.purchases.reduce((acc, p) => acc + p.balance, 0);

  cust.remindersSent.push({ date: new Date().toISOString().split('T')[0], channel: "In-App", message: `Due ₹${totalDue}` });
  
  // Notification for Customer's Account
  addNotification(
    'REMINDER',
    'Payment Reminder Alert',
    `Dear ${cName}, you have a balance due of ₹${totalDue.toLocaleString('en-IN')}. Please pay online or at shop.`,
    '',
    cust.phone,
    'கடன் நிலுவை நினைவூட்டல்',
    `அன்பார்ந்த ${cName}, உங்கள் கடன் பாக்கி ₹${totalDue.toLocaleString('en-IN')}. தயவுசெய்து செலுத்தவும்.`
  );

  // Notification for Admin View
  addNotification(
    'REMINDER_SENT',
    'Payment Reminder Sent',
    `You have sent a reminder to ${cName} to pay the bill`,
    '',
    null,
    'நினைவூட்டல் அனுப்பப்பட்டது',
    `நீங்கள் ${cName} என்பவருக்கு பில் செலுத்த நினைவூட்டல் அனுப்பியுள்ளீர்கள்`
  );
  
  saveData();
  renderOverdueTable();

  showToast(currentLang === 'ta' ? 'அறிவிப்பு அனுப்பப்பட்டது' : 'In-App Alert Sent!', `Notified ${cName}`, '');
}

// Notifications
function addNotification(type, title, message, icon, targetPhone = null, titleTa = null, messageTa = null) {
  const newNotif = {
    id: 'NOTIF-' + Date.now(),
    customerPhone: targetPhone,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: type,
    title: title,
    titleTa: titleTa || title,
    message: message,
    messageTa: messageTa || message,
    icon: icon || '',
    read: false
  };

  notifications.unshift(newNotif);
  saveData();
  renderNotifications();
}

function renderNotifications() {
  let visibleNotifs = notifications;
  if (currentAuthRole === 'customer' || currentRole === 'customer') {
    const activeCust = customers[loggedInCustomerIndex];
    if (activeCust) {
      const activePhone = activeCust.phone.trim();
      visibleNotifs = notifications.filter(n => n.customerPhone && n.customerPhone.trim() === activePhone);
    } else {
      visibleNotifs = [];
    }
  }

  const unreadCount = visibleNotifs.filter(n => !n.read).length;
  document.getElementById('notifCountBadge').textContent = unreadCount;

  const isCustomerView = (currentAuthRole === 'customer' || currentRole === 'customer');
  const activeCust = isCustomerView ? customers[loggedInCustomerIndex] : null;
  const activeCustName = activeCust ? activeCust.name : '';

  function processText(text) {
    if (!text) return '';

    if (isCustomerView) {
      if (!activeCustName) return text;
      let res = text;
      const escapedName = activeCustName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      
      // Replace possessive e.g. "Ramesh Kumar's" / "tam's" -> "Your"
      res = res.replace(new RegExp(escapedName + "'s", 'gi'), currentLang === 'ta' ? 'உங்கள்' : 'Your');

      // Replace Tamil possessive variations if present
      if (currentLang === 'ta' && activeCust.nameTa) {
        const taName = activeCust.nameTa.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        res = res.replace(new RegExp(taName + "வின்|" + taName + "யின்|" + taName + " இன்|" + taName + "இன்", 'gi'), 'உங்கள்');
        res = res.replace(new RegExp(taName, 'gi'), 'நீங்கள்');
      }

      // Replace plain customer name e.g. "Ramesh Kumar" / "tam" -> "You"
      res = res.replace(new RegExp(escapedName, 'gi'), currentLang === 'ta' ? 'நீங்கள்' : 'You');

      // Clean up phrasing for Customer View
      res = res.replace(/\bShop owner's\b|\bshop owner's\b/gi, currentLang === 'ta' ? 'அட்மினின்' : 'Admin\'s');
      res = res.replace(/\bShop owner\b|\bshop owner\b/gi, currentLang === 'ta' ? 'அட்மின்' : 'Admin');
      res = res.replace(/Dear You,/gi, currentLang === 'ta' ? 'வணக்கம்,' : 'Dear Customer,');
      res = res.replace(/to You\b/gi, currentLang === 'ta' ? 'உங்களுக்கு' : 'to You');

      return res;
    } else {
      // ADMIN VIEW PHRASING: Replace "Shop owner" / "shop owner" / "Admin" with "You" / "Your"
      let res = text;
      res = res.replace(/\bShop owner's\b|\bshop owner's\b|\bAdmin's\b|\badmin's\b/gi, currentLang === 'ta' ? 'உங்கள்' : 'Your');
      res = res.replace(/\bShop owner\b|\bshop owner\b|\bAdmin\b|\badmin\b/gi, currentLang === 'ta' ? 'நீங்கள்' : 'You');
      res = res.replace(/கடை உரிமையாளரின்|கடை உரிமையாளர்|அட்மினின்|அட்மின்/g, currentLang === 'ta' ? 'நீங்கள்' : 'You');
      return res;
    }
  }

  const drawerList = document.getElementById('notifDrawerList');
  if (visibleNotifs.length === 0) {
    drawerList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">${currentLang === 'ta' ? 'அறிவிப்புகள் எதுவும் இல்லை' : 'No notifications for your account.'}</div>`;
  } else {
    drawerList.innerHTML = visibleNotifs.slice(0, 10).map(n => {
      const rawTitle = (currentLang === 'ta' && n.titleTa) ? n.titleTa : n.title;
      const rawMsg = (currentLang === 'ta' && n.messageTa) ? n.messageTa : n.message;
      return `
        <div class="notif-item ${!n.read ? 'unread' : ''}">
          <div style="display: flex; justify-content: space-between; font-weight: 600; color: var(--text-primary);">
            <span>${n.icon} ${processText(rawTitle)}</span>
          </div>
          <p style="color: var(--text-secondary); margin-top: 2px;">${processText(rawMsg)}</p>
          <div class="notif-time">${n.timestamp}</div>
        </div>
      `;
    }).join('');
  }

  const fullContainer = document.getElementById('fullNotifContainer');
  if (visibleNotifs.length === 0) {
    fullContainer.innerHTML = `<div style="padding: 32px; text-align: center; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-color);">${currentLang === 'ta' ? 'அறிவிப்புகள் எதுவும் இல்லை' : 'No personal notifications for your account.'}</div>`;
  } else {
    fullContainer.innerHTML = visibleNotifs.map(n => {
      const rawTitle = (currentLang === 'ta' && n.titleTa) ? n.titleTa : n.title;
      const rawMsg = (currentLang === 'ta' && n.messageTa) ? n.messageTa : n.message;
      return `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px 20px; border-radius: var(--radius-md); display: flex; align-items: flex-start; gap: 14px; box-shadow: var(--shadow-sm);">
          <div style="font-size: 24px; width: 40px; height: 40px; background: var(--bg-card-subtle); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid var(--border-color);">
            ${n.icon}
          </div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <h4 style="font-size: 15px; font-weight: 600; color: var(--text-primary);">${processText(rawTitle)}</h4>
              <span style="font-size: 11px; color: var(--text-muted);">${n.timestamp}</span>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${processText(rawMsg)}</p>
          </div>
        </div>
      `;
    }).join('');
  }
}

function toggleNotifDrawer() {
  const drawer = document.getElementById('notifDrawer');
  drawer.classList.toggle('active');
  
  if (drawer.classList.contains('active')) {
    if (currentAuthRole === 'customer' || currentRole === 'customer') {
      const activeCust = customers[loggedInCustomerIndex];
      if (activeCust) {
        const activePhone = activeCust.phone.trim();
        notifications.forEach(n => {
          if (n.customerPhone && n.customerPhone.trim() === activePhone) n.read = true;
        });
      }
    } else {
      notifications.forEach(n => n.read = true);
    }
    saveData();
    renderNotifications();
  }
}

function clearAllNotifications() {
  if (currentAuthRole === 'customer' || currentRole === 'customer') {
    const activeCust = customers[loggedInCustomerIndex];
    if (activeCust) {
      const activePhone = activeCust.phone.trim();
      notifications.forEach(n => {
        if (n.customerPhone && n.customerPhone.trim() === activePhone) n.read = true;
      });
    }
  } else {
    notifications.forEach(n => n.read = true);
  }
  saveData();
  renderNotifications();
  showToast(currentLang === 'ta' ? 'அறிவிப்புகள் படிக்கப்பட்டன' : 'Cleared', 'Read all notifications', '');
}

// Toast
function showToast(title, message, icon = '') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    ${icon ? `<div class="toast-icon">${icon}</div>` : ''}
    <div class="toast-content">
      <h5>${title}</h5>
      <p>${message}</p>
    </div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================================
// Legal Compliance & Policy Modal Controller
// ============================================================================
let currentActivePolicyKey = 'privacy';

function openPolicyModal(policyKey = 'privacy') {
  currentActivePolicyKey = policyKey;
  switchPolicyTab(policyKey);
  const modal = document.getElementById('policyModal');
  if (modal) {
    modal.classList.add('active');
    // Accessibility: Focus first interactive element or content panel
    const bodyEl = document.getElementById('policyModalBody');
    if (bodyEl) bodyEl.scrollTop = 0;
  }
}

function closePolicyModal() {
  const modal = document.getElementById('policyModal');
  if (modal) modal.classList.remove('active');
}

function switchPolicyTab(policyKey) {
  currentActivePolicyKey = policyKey;
  const tabKeys = ['privacy', 'terms', 'cookie', 'refund', 'datacollection', 'thirdparty', 'copyright', 'reviews'];
  tabKeys.forEach(k => {
    const btn = document.getElementById(`polTab_${k}`);
    if (btn) {
      const isActive = (k === policyKey);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  });

  renderPolicyContent(policyKey);
}

function renderPolicyContent(policyKey) {
  const doc = (typeof policyDocuments !== 'undefined') ? policyDocuments[policyKey] : null;
  const bodyEl = document.getElementById('policyModalBody');
  const titleEl = document.getElementById('policyModalTitle');
  const iconEl = document.getElementById('policyModalIcon');
  if (!doc || !bodyEl) return;

  if (iconEl) iconEl.textContent = '';
  if (titleEl) titleEl.textContent = (currentLang === 'ta' && doc.titleTa) ? doc.titleTa : doc.title;
  bodyEl.innerHTML = doc.content;
}

// ============================================================================
// Cookie Consent & Local Storage Manager
// ============================================================================
function checkCookieConsent() {
  const consent = localStorage.getItem('kisan_cookie_consent');
  const banner = document.getElementById('cookieConsentBanner');
  if (!consent && banner) {
    setTimeout(() => {
      banner.classList.add('active');
    }, 1200);
  }
}

function acceptAllCookies() {
  localStorage.setItem('kisan_cookie_consent', 'all');
  const banner = document.getElementById('cookieConsentBanner');
  if (banner) banner.classList.remove('active');
  showToast(
    currentLang === 'ta' ? 'விருப்பங்கள் சேமிக்கப்பட்டன' : 'Preferences Saved',
    currentLang === 'ta' ? 'அனைத்து குக்கீ விருப்பங்களும் ஏற்றுக்கொள்ளப்பட்டன' : 'Cookie and local storage preferences accepted.',
    ''
  );
}

function acceptEssentialCookies() {
  localStorage.setItem('kisan_cookie_consent', 'essential');
  const banner = document.getElementById('cookieConsentBanner');
  if (banner) banner.classList.remove('active');
  showToast(
    currentLang === 'ta' ? 'அத்தியாவசியம் மட்டும் சேமிக்கப்பட்டது' : 'Essential Storage Only',
    currentLang === 'ta' ? 'அத்தியாவசிய அமர்வு சேமிப்பகம் மட்டுமே இயக்கத்தில் உள்ளது' : 'Only strictly essential session keys will be retained.',
    ''
  );
}

function showCookieSettings() {
  openPolicyModal('cookie');
  const banner = document.getElementById('cookieConsentBanner');
  if (banner) banner.classList.add('active');
}

// ============================================================================
// Global Keyboard Accessibility & Escape Listener
// ============================================================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close any active modal
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    activeModals.forEach(m => m.classList.remove('active'));

    // Close notification drawer if open
    const notifDrawer = document.getElementById('notifDrawer');
    if (notifDrawer && notifDrawer.classList.contains('active')) {
      notifDrawer.classList.remove('active');
    }

    // Close cookie banner if open
    const cookieBanner = document.getElementById('cookieConsentBanner');
    if (cookieBanner && cookieBanner.classList.contains('active')) {
      cookieBanner.classList.remove('active');
    }
  }
});

