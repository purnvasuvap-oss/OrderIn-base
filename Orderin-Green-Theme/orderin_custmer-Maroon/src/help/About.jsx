import React from 'react';
import './About.css';
import {
  ChevronLeft,
  Clock,
  MapPin,
  Phone,
  Sparkles,
  Star,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTableNumber } from '../hooks/useTableNumber';

const restaurantHighlights = [
  {
    title: 'Fresh Kitchen',
    description: 'Meals are prepared in small batches with ingredients checked each morning.',
    icon: UtensilsCrossed,
  },
  {
    title: 'Quick Table Service',
    description: 'Orders placed through OrderIn go straight to the kitchen for faster handling.',
    icon: Sparkles,
  },
  {
    title: 'Comfortable Dining',
    description: 'A calm, family-friendly space built for relaxed meals and easy ordering.',
    icon: Star,
  },
];

const branches = [
  {
    name: 'Central Branch',
    address: '123 Main Street, City Center',
    hours: '9:00 AM - 11:00 PM',
    phone: '+91 98765 43210',
  },
  {
    name: 'Riverside Branch',
    address: '45 Riverside Drive, Northside',
    hours: '10:00 AM - 10:00 PM',
    phone: '+91 91234 56789',
  },
  {
    name: 'Mall Outlet',
    address: 'Unit G12, City Mall',
    hours: '11:00 AM - 10:30 PM',
    phone: '+91 90123 45678',
  },
];

const teamRoles = ['Head Chef', 'Kitchen Team', 'Service Staff', 'Restaurant Manager'];

export default function About() {
  const navigate = useNavigate();
  const { getPathWithTable } = useTableNumber();

  const goToMenu = () => navigate(getPathWithTable('/menu'));

  return (
    <div className="about-root">
      <header className="about-topbar">
        <button
          className="about-back-button"
          aria-label="Back to Menu"
          onClick={goToMenu}
        >
          <ChevronLeft size={22} />
        </button>
        <span className="about-topbar-title">About Restaurant</span>
      </header>

      <section className="about-hero" aria-labelledby="restaurant-title">
        <div className="about-hero-content">
          <p className="about-eyebrow">Restaurant Profile</p>
          <h1 id="restaurant-title">Foodie's Paradise</h1>
          <p className="about-hero-copy">
            Fresh food, steady service, and a simple table-ordering experience for every visit.
          </p>

          <div className="about-hero-facts" aria-label="Restaurant quick details">
            <div className="about-fact">
              <Clock size={20} />
              <div>
                <span>Open Daily</span>
                <strong>9 AM - 11 PM</strong>
              </div>
            </div>
            <div className="about-fact">
              <UtensilsCrossed size={20} />
              <div>
                <span>Service</span>
                <strong>Dine-in Orders</strong>
              </div>
            </div>
            <div className="about-fact">
              <Users size={20} />
              <div>
                <span>Dining Style</span>
                <strong>Family Friendly</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="about-main">
        <section className="about-section-shell about-story-section">
          <div className="about-section-heading">
            <p>Our Story</p>
            <h2>Built around fresh meals and smoother ordering.</h2>
          </div>
          <p className="about-story-copy">
            Foodie's Paradise focuses on everyday comfort food made with consistent quality.
            The restaurant keeps service simple: browse the live menu, place your table order,
            and let the kitchen prepare it with clear item notes and instructions.
          </p>
        </section>

        <section className="about-highlight-grid" aria-label="Restaurant highlights">
          {restaurantHighlights.map(({ title, description, icon: Icon }) => (
            <article className="about-highlight-card" key={title}>
              <div className="about-card-icon">
                <Icon size={22} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className="about-section-shell">
          <div className="about-section-heading">
            <p>Locations</p>
            <h2>Visit a nearby branch.</h2>
          </div>

          <div className="about-branch-grid">
            {branches.map((branch) => (
              <article className="about-branch-card" key={branch.name}>
                <h3>{branch.name}</h3>
                <p>
                  <MapPin size={16} />
                  <span>{branch.address}</span>
                </p>
                <p>
                  <Clock size={16} />
                  <span>{branch.hours}</span>
                </p>
                <a href={`tel:${branch.phone.replace(/\s/g, '')}`} className="about-branch-phone">
                  <Phone size={16} />
                  <span>{branch.phone}</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section-shell">
          <div className="about-section-heading">
            <p>Team</p>
            <h2>The people behind your order.</h2>
          </div>

          <div className="about-team-grid">
            {teamRoles.map((role) => (
              <div className="about-team-card" key={role}>
                <div className="about-team-avatar">
                  <Users size={22} />
                </div>
                <span>{role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="about-cta">
          <div>
            <p>Ready to order?</p>
            <h2>Go back to the live menu.</h2>
          </div>
          <button className="about-primary-action" onClick={goToMenu}>
            <UtensilsCrossed size={18} />
            <span>View Menu</span>
          </button>
        </section>
      </main>

      <footer className="about-footer">
        <p>© 2025 Foodie's Paradise. All rights reserved.</p>
      </footer>
    </div>
  );
}
