import { useNavigate } from "react-router-dom";
import InventoryImg from "./landingpage/inventory.png";
import MenuImg from "./landingpage/menu.png";
import FinancialImg from "./landingpage/finance.png";
import OrdersImg from "./landingpage/order.png";
// import Header from "./header.jsx"
// import Footer from "./footer.jsx"

import "./Dashboard.css";

const Dashboard = () => {
  const navigate = useNavigate();

  const goTo = (path) => () => navigate(path);

  return (
    <div>
    <div className="landing-container-">
      <div className="content-">
        <div>
            <h2 style={{marginBottom:'10px', color : '#43A047'}}> Simplifying restaurant management</h2>
            <h2 >one click at a time</h2>
        </div>

        <div className="cards-">
          <div className="card-" onClick={goTo('/menu-login')}> 
            <img src={MenuImg} alt="MenuIcon" />
            <h3>Menu</h3>
            <p>Keep dishes, categories, and promotions updated.</p>
            <button onClick={goTo('/menu-login')}>Open</button>
          </div>

          <div className="card-" onClick={goTo('/finance-login')}>
            <img src={FinancialImg} alt="Financial" />
            <h3>Financial</h3>
            <p>Handle transactions, generate bills, and access reports.</p>
            <button onClick={goTo('/finance-login')}>Open</button>
          </div>

          <div className="card-" onClick={goTo('/orders')}>
            <img src={OrdersImg} alt="Orders" />
            <h3>Orders</h3>
            <p>Track live orders and view history in real time.</p>
            <button onClick={goTo('/orders')}>Open</button>
          </div>

          <div className="card-" onClick={goTo('/inventory-login')}>
            <img src={InventoryImg} alt="Inventory" />
            <h3>Inventory</h3>
            <p>Monitor stock levels and receive low-stock alerts.</p>
            <button onClick={goTo('/inventory-login')}>Open</button>
          </div>
        </div>
      </div>
    </div>
    {/* <Footer /> */}
    </div>

  );
};

export default Dashboard;
