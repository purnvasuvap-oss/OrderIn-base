import React, { useEffect, useState } from 'react';
import './OrderInAbout.css';
import { useNavigate } from 'react-router-dom';
import { useTableNumber } from '../hooks/useTableNumber';

export default function OrderInAbout() {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  const services = [
    {
      title: 'Bill Generation',
      description: 'Automated bill creation for seamless transactions.',
      image: '/bill-generation.jpeg'
    },
    {
      title: 'Work Finance Handling',
      description: 'Efficient tracking and management of finances.',
      image: '/work-finance.jpeg'
    },
    {
      title: 'Inventory Support',
      description: 'Advanced inventory tracking with real-time updates.',
      image: '/inventory-support.jpeg'
    },
    {
      title: 'Links Inventory Flash Checking',
      description: 'Quick and accurate inventory flash checks.',
      image: '/inventory-flash.jpeg'
    },
    {
      title: 'Order Receiving',
      description: 'Track and manage all incoming orders effortlessly.',
      image: '/order-receiving.jpeg'
    },
    {
      title: 'Dynamic Menu Controlling',
      description: 'Instant menu item updates based on business needs.',
      image: '/dynamic-menu.jpeg'
    },
    {
      title: 'Advertising',
      description: 'Built-in tools to publish and manage advertisements.',
      image: '/advertising.jpeg'
    },
    {
      title: 'Feedback Receiving',
      description: 'Collect and analyze customer feedback.',
      image: '/feedback.jpeg'
    }
  ];

  return (
    <div className="orderin-about-container">
      <div className="back-button-container">
        <button 
          className="back-button-top"
          onClick={() => navigate(getPathWithTable('/menu'))}
          aria-label="Back to Menu"
        >
          ← Back to Home
        </button>
      </div>

      <header className="orderin-header">
        <img src="/OrderIn.png" alt="OrderIn Logo" className="logo" />
        <p className="by-text">By</p>
        <img src="/company-logo.png" alt="Company Logo" className="Clogo" />
      </header>

      <main className="orderin-main">
        {/* About Section */}
        <section className="orderin-section animated-section animated-section-delay-1">
          <div className="about-header">
            <h2>About</h2>
            <img src="/OrderIn.png" alt="OrderIn Logo" className="logo2" />
          </div>
          <p>
            OrderIn is a comprehensive ordering support and CRM platform designed to streamline
            business operations.
          </p>
        </section>

        {/* Services Section */}
        <section className="orderin-section animated-section animated-section-delay-2">
          <h2>Our Services</h2>

          <div className="services-grid">
            {services.map((service, index) => (
              <div key={index} className="service-card with-image">
                <img 
                  src={service.image} 
                  alt={service.title} 
                  className="service-img"
                />
                <div className="service-content">
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contact Section */}
        <section className="orderin-section animated-section animated-section-delay-3">
          <h2>Contact Us</h2>

          <p>
            <span className="contact-label">Email:</span>
            <a href="mailto:purnvasu.vap@gmail.com" className="contact-link">
              purnvasu.vap@gmail.com
            </a>
          </p>

          <p>
            <span className="contact-label">Phone:</span>
            <a href="tel:+918639987869" className="contact-link">
              +91 8639987869
            </a>
          </p>
        </section>

        {/* Explore More Section */}
        <section className="orderin-section animated-section animated-section-delay-3">
          <h2>Explore More</h2>
          <div className="explore-container">
            <a 
              href="https://purnvasu.in/" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <img 
                src="/company-logo.png" 
                alt="PurnVasu Tech Solutions" 
                className="Clogo2"
              />
            </a>
            <p className="explore-text">Click here to explore <br /><span className="explore-subtext">(Our amazing landing page)</span></p>
          </div>
        </section>
      </main>

      <footer className="orderin-footer">
        <p>&copy; 2025 PurnVasu Tech Solutions Private Limited. All rights reserved.</p>
      </footer>
    </div>
  );
}
