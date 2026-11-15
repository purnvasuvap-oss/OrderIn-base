import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTableNumber } from '../hooks/useTableNumber';
import './Help.css';

function Help({ setIsLoading }) {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [openSection, setOpenSection] = useState('about');
  const location = useLocation();

  // If a `section` query param is provided (e.g. ?section=about), open that accordion on mount.
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const section = params.get('section');
      if (section) {
        setOpenSection(section);
      }
    } catch (err) {
      // ignore malformed query
    }
  }, [location.search]);

  const sendMail = (e) => {
    e.preventDefault();
    if (!email) {
      alert('Please enter your email before sending.');
      return;
    }
    const to = 'purnvasu.vap@gmail.com';
    const subject = encodeURIComponent('OrderIn Help Request');
    const bodyLines = [];
    if (name) bodyLines.push(`Name: ${name}`);
    bodyLines.push(`From: ${email}`);
    bodyLines.push('');
    bodyLines.push('Message:');
    bodyLines.push(message || '(no message provided)');
    const body = encodeURIComponent(bodyLines.join('\n'));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const toggleSection = (key) => setOpenSection(openSection === key ? null : key);

  return (
    <div className="help-container">
      <div className="help-card">
        <div className="help-header-row">
          <button className="help-back" onClick={() => navigate(getPathWithTable('/menu'))}>Back</button>
          <h1>Help & FAQ</h1>
        </div>

        <div className="help-accordion">
          <div className="accordion-item">
            <button className="accordion-caption" aria-expanded={openSection === 'about'} onClick={() => toggleSection('about')}>Ordering Help</button>
            {openSection === 'about' && (
              <div className="accordion-content">
                <p>
                  Browse the menu, add items to your cart, review the bill, and choose a payment option.
                  If something looks wrong, go back to the cart before placing the order.
                </p>
              </div>
            )}
          </div>

          <div className="accordion-item">
            <button className="accordion-caption" aria-expanded={openSection === 'faq'} onClick={() => toggleSection('faq')}>Quick FAQs</button>
            {openSection === 'faq' && (
              <div className="accordion-content">
                <dl>
                  <dt>How does the verification code work?</dt>
                  <dd>
                    The code confirms your phone number during login or payment verification. Enter the
                    code shown or sent to you to continue.
                  </dd>

                  <dt>Can I change cooking preferences?</dt>
                  <dd>
                    Yes. Add instructions from the item details page or edit them from the cart before checkout.
                  </dd>

                  <dt>What if an item shows unavailable?</dt>
                  <dd>
                    Unavailable items cannot be added to the cart. Please choose another item or ask the counter.
                  </dd>
                </dl>
              </div>
            )}
          </div>

          <div className="accordion-item">
            <button className="accordion-caption" aria-expanded={openSection === 'contact'} onClick={() => toggleSection('contact')}>Contact Help</button>
            {openSection === 'contact' && (
              <div className="accordion-content">
                <p>
                  If you need additional assistance, send us a message. Your email app will open with the
                  details filled in.
                </p>

                <form className="help-form" onSubmit={sendMail}>
                  <label>
                    Name (optional)
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </label>
                  <label>
                    Your Email (required)
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" required />
                  </label>
                  <label>
                    Message
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" />
                  </label>

                  <div className="help-actions">
                    <button type="submit" className="send-btn">Send</button>
                    <button type="button" className="back-btn" onClick={() => navigate(getPathWithTable('/menu'))}>Back to Menu</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Help;
