import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Login from './login/login';
// Menu merged into single file: import canonical Menu
import Menu from './menu/Menu';
import Help from './help/Help';
import About from './help/About';
import OrderInAbout from './help/OrderInAbout';
import ItemDetails from './itemDetails/ItemDetails';
import Profile from './profile/Profile';
import Cart from './cart/Cart';
import Bill from './Bill';
import Payments from './payments/Payments';
import PaymentSuccess from './payments/PaymentSuccess';
import CounterCode from './payments/CounterCode';
import Loading from './Loading';
import Header from './header/header';
import AppContent from './AppContent';

function App() {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Router>
      <AppContent isLoading={isLoading} setIsLoading={setIsLoading} />
    </Router>
  );
}

export default App;
