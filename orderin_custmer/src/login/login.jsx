import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import "./login.css";

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  // Remove OTP state
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [searchCode, setSearchCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [restaurantStatus, setRestaurantStatus] = useState(null); // 'Active', 'Inactive', 'Off', or null
  const [inactiveTimestamp, setInactiveTimestamp] = useState(null); // Firestore timestamp (ms)
  const [statusError, setStatusError] = useState("");
    // Fetch restaurant status from Firestore on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const restaurantRef = doc(db, "Restaurant", "orderin_restaurant_1");
        const restaurantSnap = await getDoc(restaurantRef);
        if (restaurantSnap.exists()) {
          const data = restaurantSnap.data();
          setRestaurantStatus(data.status || null);
          setInactiveTimestamp(data.inactiveTimestamp || null);
        } else {
          setRestaurantStatus(null);
          setInactiveTimestamp(null);
        }
      } catch (err) {
        setRestaurantStatus(null);
        setInactiveTimestamp(null);
        setStatusError("Could not fetch restaurant status. Please try again later.");
      }
    };
    fetchStatus();
  }, []);

  // Disable back navigation after logout - make login the root page
  useEffect(() => {
    // Clear history stack
    window.history.pushState(null, null, window.location.href);
    
    // Prevent browser back button
    const handlePopState = (e) => {
      window.history.pushState(null, null, window.location.href);
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Handle mobile keyboard scrolling - ensure focused input stays visible
  useEffect(() => {
    const handleInputFocus = (e) => {
      if (!e.target) return;
      
      console.log('Input focused:', e.target.name || e.target.placeholder);
      
      // Immediate scroll attempt
      e.target.scrollIntoView({ behavior: 'instant', block: 'center' });
      
      // Delayed scroll to account for keyboard animation
      const timer1 = setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('Delayed scroll to focused input');
      }, 100);
      
      // Extra delayed scroll for slow keyboards
      const timer2 = setTimeout(() => {
        e.target.scrollIntoView({ behavior: 'instant', block: 'center' });
        console.log('Extra scroll to ensure visibility');
      }, 500);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    };

    const handleInputBlur = () => {
      console.log('Input blurred');
    };

    // Get all input elements
    const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="password"], input[type="email"], input[type="number"]');
    
    // Add focus and blur listeners to all inputs
    inputs.forEach(input => {
      input.addEventListener('focus', handleInputFocus);
      input.addEventListener('blur', handleInputBlur);
    });

    return () => {
      inputs.forEach(input => {
        input.removeEventListener('focus', handleInputFocus);
        input.removeEventListener('blur', handleInputBlur);
      });
    };
  }, []);

  // Cooldown timer to prevent rapid repeated OTP requests
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const saveUserToFirestore = async (phoneNumber, enteredName) => {
    try {
      const customerRef = doc(db, "Restaurant", "orderin_restaurant_1", "customers", phoneNumber);
      const customerSnap = await getDoc(customerRef);

      const timestamp = new Date().toISOString();

      let names = [];
      let loginHistory = [];

      if (customerSnap.exists()) {
        // Document exists, update it
        const existingData = customerSnap.data();
        names = existingData.names || [];
        loginHistory = existingData.loginHistory || [];

        // Check if name already exists
        if (!names.includes(enteredName)) {
          names.push(enteredName);
        }
        // Add login timestamp to history
        loginHistory.push(timestamp);
      }

      if (customerSnap.exists()) {
        await setDoc(customerRef, {
          phone: phoneNumber,
          names: names,
          loginHistory: loginHistory,
          updatedAt: serverTimestamp()
        }, { merge: true });
        return { success: true };
      } else {
        await setDoc(customerRef, {
          phone: phoneNumber,
          names: [enteredName],
          loginHistory: [timestamp],
          likedItems: [],
          pastOrders: [],
          feedback: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        return { success: true };
      }
    } catch (error) {
      console.error("Error saving user to Firestore:", error);
      return { success: false, error: error.message };
    }
  };



  // Direct login handler
  const handleDirectLogin = async () => {
    // Restaurant status logic for login restriction
    if (
      restaurantStatus === "Off" ||
      (restaurantStatus === "Inactive" &&
        (!inactiveTimestamp ||
          Date.now() - inactiveTimestamp > 5 * 24 * 60 * 60 * 1000))
    ) {
      if (restaurantStatus === "Off") {
        setErrorMessage("Login is currently disabled. Restaurant is Off.");
      } else if (restaurantStatus === "Inactive") {
        setErrorMessage("Login is only allowed for 5 days after Inactive. Please contact the restaurant.");
      } else {
        setErrorMessage("Login is currently disabled. Please try again later.");
      }
      return;
    }
    if (phone.trim() === "") {
      setErrorMessage("Please enter phone number");
      return;
    }
    if (username.trim() === "") {
      setErrorMessage("Please enter your name");
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    try {
      const fullPhone = `${countryCode}${phone}`;
      const result = await saveUserToFirestore(fullPhone, username);
      if (result.success) {
        const user = { username, phone: fullPhone };
        localStorage.setItem("user", JSON.stringify(user));
        localStorage.setItem("tableNumber", window.tableNumber || '1');
        alert(`Welcome ${username}!`);
        navigate(`/menu?table=${window.tableNumber || '1'}`);
      } else {
        setErrorMessage(`Error saving user: ${result.error}`);
      }
    } catch (error) {
      setErrorMessage(`Error: ${error?.message || error}`);
    } finally {
      setIsLoading(false);
    }
  };
  // ...existing code...



  const countryCodes = [
    { code: "+1", country: "United States" },
    { code: "+7", country: "Russia" },
    { code: "+20", country: "Egypt" },
    { code: "+27", country: "South Africa" },
    { code: "+30", country: "Greece" },
    { code: "+31", country: "Netherlands" },
    { code: "+32", country: "Belgium" },
    { code: "+33", country: "France" },
    { code: "+34", country: "Spain" },
    { code: "+36", country: "Hungary" },
    { code: "+39", country: "Italy" },
    { code: "+40", country: "Romania" },
    { code: "+41", country: "Switzerland" },
    { code: "+43", country: "Austria" },
    { code: "+44", country: "United Kingdom" },
    { code: "+45", country: "Denmark" },
    { code: "+46", country: "Sweden" },
    { code: "+47", country: "Norway" },
    { code: "+48", country: "Poland" },
    { code: "+49", country: "Germany" },
    { code: "+51", country: "Peru" },
    { code: "+52", country: "Mexico" },
    { code: "+53", country: "Cuba" },
    { code: "+54", country: "Argentina" },
    { code: "+55", country: "Brazil" },
    { code: "+56", country: "Chile" },
    { code: "+57", country: "Colombia" },
    { code: "+58", country: "Venezuela" },
    { code: "+60", country: "Malaysia" },
    { code: "+61", country: "Australia" },
    { code: "+62", country: "Indonesia" },
    { code: "+63", country: "Philippines" },
    { code: "+64", country: "New Zealand" },
    { code: "+65", country: "Singapore" },
    { code: "+66", country: "Thailand" },
    { code: "+81", country: "Japan" },
    { code: "+82", country: "South Korea" },
    { code: "+84", country: "Vietnam" },
    { code: "+86", country: "China" },
    { code: "+90", country: "Turkey" },
    { code: "+91", country: "India" },
    { code: "+92", country: "Pakistan" },
    { code: "+93", country: "Afghanistan" },
    { code: "+94", country: "Sri Lanka" },
    { code: "+95", country: "Myanmar" },
    { code: "+98", country: "Iran" },
    { code: "+212", country: "Morocco" },
    { code: "+213", country: "Algeria" },
    { code: "+216", country: "Tunisia" },
    { code: "+218", country: "Libya" },
    { code: "+220", country: "Gambia" },
    { code: "+221", country: "Senegal" },
    { code: "+222", country: "Mauritania" },
    { code: "+223", country: "Mali" },
    { code: "+224", country: "Guinea" },
    { code: "+225", country: "Ivory Coast" },
    { code: "+226", country: "Burkina Faso" },
    { code: "+227", country: "Niger" },
    { code: "+228", country: "Togo" },
    { code: "+229", country: "Benin" },
    { code: "+230", country: "Mauritius" },
    { code: "+231", country: "Liberia" },
    { code: "+232", country: "Sierra Leone" },
    { code: "+233", country: "Ghana" },
    { code: "+234", country: "Nigeria" },
    { code: "+235", country: "Chad" },
    { code: "+236", country: "Central African Republic" },
    { code: "+237", country: "Cameroon" },
    { code: "+238", country: "Cape Verde" },
    { code: "+239", country: "Sao Tome and Principe" },
    { code: "+240", country: "Equatorial Guinea" },
    { code: "+241", country: "Gabon" },
    { code: "+242", country: "Republic of the Congo" },
    { code: "+243", country: "Democratic Republic of the Congo" },
    { code: "+244", country: "Angola" },
    { code: "+245", country: "Guinea-Bissau" },
    { code: "+246", country: "British Indian Ocean Territory" },
    { code: "+248", country: "Seychelles" },
    { code: "+249", country: "Sudan" },
    { code: "+250", country: "Rwanda" },
    { code: "+251", country: "Ethiopia" },
    { code: "+252", country: "Somalia" },
    { code: "+253", country: "Djibouti" },
    { code: "+254", country: "Kenya" },
    { code: "+255", country: "Tanzania" },
    { code: "+256", country: "Uganda" },
    { code: "+257", country: "Burundi" },
    { code: "+258", country: "Mozambique" },
    { code: "+260", country: "Zambia" },
    { code: "+261", country: "Madagascar" },
    { code: "+262", country: "Reunion" },
    { code: "+263", country: "Zimbabwe" },
    { code: "+264", country: "Namibia" },
    { code: "+265", country: "Malawi" },
    { code: "+266", country: "Lesotho" },
    { code: "+267", country: "Botswana" },
    { code: "+268", country: "Swaziland" },
    { code: "+269", country: "Comoros" },
    { code: "+290", country: "Saint Helena" },
    { code: "+291", country: "Eritrea" },
    { code: "+297", country: "Aruba" },
    { code: "+298", country: "Faroe Islands" },
    { code: "+299", country: "Greenland" },
    { code: "+350", country: "Gibraltar" },
    { code: "+351", country: "Portugal" },
    { code: "+352", country: "Luxembourg" },
    { code: "+353", country: "Ireland" },
    { code: "+354", country: "Iceland" },
    { code: "+355", country: "Albania" },
    { code: "+356", country: "Malta" },
    { code: "+357", country: "Cyprus" },
    { code: "+358", country: "Finland" },
    { code: "+359", country: "Bulgaria" },
    { code: "+370", country: "Lithuania" },
    { code: "+371", country: "Latvia" },
    { code: "+372", country: "Estonia" },
    { code: "+373", country: "Moldova" },
    { code: "+374", country: "Armenia" },
    { code: "+375", country: "Belarus" },
    { code: "+376", country: "Andorra" },
    { code: "+377", country: "Monaco" },
    { code: "+378", country: "San Marino" },
    { code: "+380", country: "Ukraine" },
    { code: "+381", country: "Serbia" },
    { code: "+382", country: "Montenegro" },
    { code: "+383", country: "Kosovo" },
    { code: "+385", country: "Croatia" },
    { code: "+386", country: "Slovenia" },
    { code: "+387", country: "Bosnia and Herzegovina" },
    { code: "+389", country: "Macedonia" },
    { code: "+420", country: "Czech Republic" },
    { code: "+421", country: "Slovakia" },
    { code: "+423", country: "Liechtenstein" },
    { code: "+500", country: "Falkland Islands" },
    { code: "+501", country: "Belize" },
    { code: "+502", country: "Guatemala" },
    { code: "+503", country: "El Salvador" },
    { code: "+504", country: "Honduras" },
    { code: "+505", country: "Nicaragua" },
    { code: "+506", country: "Costa Rica" },
    { code: "+507", country: "Panama" },
    { code: "+508", country: "Saint Pierre and Miquelon" },
    { code: "+509", country: "Haiti" },
    { code: "+590", country: "Guadeloupe" },
    { code: "+591", country: "Bolivia" },
    { code: "+592", country: "Guyana" },
    { code: "+593", country: "Ecuador" },
    { code: "+594", country: "French Guiana" },
    { code: "+595", country: "Paraguay" },
    { code: "+596", country: "Martinique" },
    { code: "+597", country: "Suriname" },
    { code: "+598", country: "Uruguay" },
    { code: "+599", country: "Netherlands Antilles" },
    { code: "+670", country: "East Timor" },
    { code: "+672", country: "Antarctica" },
    { code: "+673", country: "Brunei" },
    { code: "+674", country: "Nauru" },
    { code: "+675", country: "Papua New Guinea" },
    { code: "+676", country: "Tonga" },
    { code: "+677", country: "Solomon Islands" },
    { code: "+678", country: "Vanuatu" },
    { code: "+679", country: "Fiji" },
    { code: "+680", country: "Palau" },
    { code: "+681", country: "Wallis and Futuna" },
    { code: "+682", country: "Cook Islands" },
    { code: "+683", country: "Niue" },
    { code: "+684", country: "American Samoa" },
    { code: "+685", country: "Samoa" },
    { code: "+686", country: "Kiribati" },
    { code: "+687", country: "New Caledonia" },
    { code: "+688", country: "Tuvalu" },
    { code: "+689", country: "French Polynesia" },
    { code: "+690", country: "Tokelau" },
    { code: "+691", country: "Micronesia" },
    { code: "+692", country: "Marshall Islands" },
    { code: "+850", country: "North Korea" },
    { code: "+852", country: "Hong Kong" },
    { code: "+853", country: "Macau" },
    { code: "+855", country: "Cambodia" },
    { code: "+856", country: "Laos" },
    { code: "+880", country: "Bangladesh" },
    { code: "+886", country: "Taiwan" },
    { code: "+960", country: "Maldives" },
    { code: "+961", country: "Lebanon" },
    { code: "+962", country: "Jordan" },
    { code: "+963", country: "Syria" },
    { code: "+964", country: "Iraq" },
    { code: "+965", country: "Kuwait" },
    { code: "+966", country: "Saudi Arabia" },
    { code: "+967", country: "Yemen" },
    { code: "+968", country: "Oman" },
    { code: "+970", country: "Palestine" },
    { code: "+971", country: "United Arab Emirates" },
    { code: "+972", country: "Israel" },
    { code: "+973", country: "Bahrain" },
    { code: "+974", country: "Qatar" },
    { code: "+975", country: "Bhutan" },
    { code: "+976", country: "Mongolia" },
    { code: "+977", country: "Nepal" },
    { code: "+992", country: "Tajikistan" },
    { code: "+993", country: "Turkmenistan" },
    { code: "+994", country: "Azerbaijan" },
    { code: "+995", country: "Georgia" },
    { code: "+996", country: "Kyrgyzstan" },
    { code: "+998", country: "Uzbekistan" },
  ];

  const filteredCodes = countryCodes.filter(
    (item) =>
      item.code.toLowerCase().includes(searchCode.toLowerCase()) ||
      item.country.toLowerCase().includes(searchCode.toLowerCase())
  );

  return (
    <div className="login-container">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}
      <div className="login-box">
        <img src="/OrderIn.png" alt="OrderIn" className="orderin-logo" />

        <>
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <div className="phone-input-container">
            <div className="country-code-wrapper">
              <input
                type="text"
                className="country-code-selector"
                placeholder="+91"
                value={countryCode}
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  setSearchCode(e.target.value);
                }}
                onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                onFocus={() => setShowCountryDropdown(true)}
                onBlur={() => setTimeout(() => setShowCountryDropdown(false), 200)}
              />
              {showCountryDropdown && (
                <div className="country-dropdown">
                  <div className="dropdown-list">
                    {filteredCodes.map((item) => (
                      <div
                        key={item.code}
                        className="dropdown-item"
                        onClick={() => {
                          setCountryCode(item.code);
                          setShowCountryDropdown(false);
                          setSearchCode("");
                        }}
                      >
                        {item.code} - {item.country}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <input
              type="tel"
              className="phone-input"
              placeholder="Enter phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {errorMessage && (
            <div style={{ color: 'red', marginBottom: '10px', fontSize: '14px', textAlign: 'center' }}>
              {errorMessage}
            </div>
          )}

              <button
                onClick={handleDirectLogin}
                className="login-btn"
                disabled={isLoading || !!statusError || restaurantStatus === null}
                style={(!!statusError || restaurantStatus === null) ? { background: '#ccc', cursor: 'not-allowed' } : {}}
              >
                {statusError
                  ? 'Status Error'
                  : restaurantStatus === null
                    ? 'Checking status...'
                    : isLoading
                      ? 'Logging in...'
                      : 'Login'}
              </button>

              {/* OTP input removed for direct login */}
        </>

        {/* recaptcha-container removed */}
      </div>
    </div>
  );
};
export default Login;
