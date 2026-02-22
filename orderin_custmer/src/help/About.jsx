import React from 'react';
import './About.css';
import { useNavigate } from 'react-router-dom';
import { useTableNumber } from '../hooks/useTableNumber';

export default function About() {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  return (
    <div className="about-root">
      <div className="about-topbar">
        <button
          className="btn-top-back"
          aria-label="Back to Menu"
          onClick={() => navigate(getPathWithTable('/menu'))}
        >
          ← Back to Menu
        </button>
      </div>
      <div className="parallax-section hero">
        <div>
          <h1>Welcome to Foodie's Paradise</h1>
          <p>Fresh Ingredients, Delicious Recipes, Delivered to Your Doorstep</p>
        </div>
      </div>

      <div className="menu-section">
        <h2>Our Restaurant</h2>
        <div className="branch-list">
          <div className="branch-card">
            <img src="https://picsum.photos/400/260?restaurant,1" alt="Branch 1" />
            <div className="branch-content">
              <h3>Central Branch</h3>
              <p>123 Main Street, City Center</p>
              <p>Open: 9:00 AM - 11:00 PM</p>
              <p>Phone: +91 98765 43210</p>
            </div>
          </div>

          <div className="branch-card">
            <img src="https://picsum.photos/400/260?restaurant,2" alt="Branch 2" />
            <div className="branch-content">
              <h3>Riverside Branch</h3>
              <p>45 Riverside Drive, Northside</p>
              <p>Open: 10:00 AM - 10:00 PM</p>
              <p>Phone: +91 91234 56789</p>
            </div>
          </div>

          <div className="branch-card">
            <img src="https://picsum.photos/400/260?restaurant,3" alt="Branch 3" />
            <div className="branch-content">
              <h3>Mall Outlet</h3>
              <p>Unit G12, City Mall</p>
              <p>Open: 11:00 AM - 10:30 PM</p>
              <p>Phone: +91 90123 45678</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rotating-plate" aria-hidden="true"></div>


      <div className="parallax-section specials-section">
        <div className="employees-overlay">
          <div className="employees-header">
            <h2>Our Employees</h2>
            <p>Meet the team behind Foodie's Paradise</p>
          </div>

          <div className="employees-grid overlay-grid">
            {[
              { name: 'Rajesh Kumar', role: 'Head Chef', img: 'https://picsum.photos/260/260?chef1' },
              { name: 'Meera Patel', role: 'Sous Chef', img: 'https://picsum.photos/260/260?chef2' },
              { name: 'Arjun Singh', role: 'Pastry Chef', img: 'https://picsum.photos/260/260?chef3' },
              { name: 'Priya Sharma', role: 'Restaurant Manager', img: 'https://picsum.photos/260/260?manager' },
              { name: 'Vikram Das', role: 'Accountant', img: 'https://picsum.photos/260/260?accountant' },
              { name: 'Anita Rao', role: 'Front of House', img: 'https://picsum.photos/260/260?staff' }
            ].map((emp) => (
              <div key={emp.name} className="employee-card">
                <div className="employee-image">
                  <img src={emp.img} alt={emp.name} />
                </div>
                <div className="employee-info">
                  <h4>{emp.name}</h4>
                  <p className="role">{emp.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="about-section">
        <h2>About Us</h2>
        <p>
          At Foodie's Paradise, we believe in delivering the freshest and most delicious meals to your doorstep. Our team is passionate about quality, sustainability, and customer satisfaction.
        </p>
        <div className="about-actions">
          <button onClick={() => navigate(getPathWithTable('/menu'))} className="btn-primary">Back to Menu</button>
        </div>
      </div>

      <div className="footer">
        <p>© 2025 Foodie's Paradise. All Rights Reserved.</p>
      </div>
    </div>
  );
}
