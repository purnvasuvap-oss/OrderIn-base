import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppContent from '../AppContent';

// Stub every route screen so this test only exercises the router wiring.
vi.mock('../login/login', () => ({ default: () => <div>login screen</div> }));
vi.mock('../menu/Menu', () => ({ default: () => <div>menu screen</div> }));
vi.mock('../help/Help', () => ({ default: () => <div>help screen</div> }));
vi.mock('../help/About', () => ({ default: () => <div>about screen</div> }));
vi.mock('../help/OrderInAbout', () => ({ default: () => <div>orderin-about screen</div> }));
vi.mock('../itemDetails/ItemDetails', () => ({ default: () => <div>item screen</div> }));
vi.mock('../profile/Profile', () => ({ default: () => <div>profile screen</div> }));
vi.mock('../cart/Cart', () => ({ default: () => <div>cart screen</div> }));
vi.mock('../Bill', () => ({ default: () => <div>bill screen</div> }));
vi.mock('../payments/Payments', () => ({ default: () => <div>payments screen</div> }));
vi.mock('../payments/PaymentSuccess', () => ({ default: () => <div>payment-success screen</div> }));
vi.mock('../payments/CounterCode', () => ({ default: () => <div>counter-code screen</div> }));
vi.mock('../payments/OnlinePayment', () => ({ default: () => <div>online-payment screen</div> }));
vi.mock('../hooks/useGlobalBackButton', () => ({ useGlobalBackButton: vi.fn() }));

const renderAt = (route) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AppContent isLoading={false} setIsLoading={vi.fn()} />
    </MemoryRouter>,
  );

describe('AppContent routing', () => {
  beforeEach(() => localStorage.setItem('user', JSON.stringify({ phone: '1' })));
  afterEach(() => localStorage.clear());

  it('renders the login screen at "/"', () => {
    renderAt('/');
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });

  it.each([
    ['/menu', 'menu screen'],
    ['/help', 'help screen'],
    ['/about', 'about screen'],
    ['/about-orderin', 'orderin-about screen'],
    ['/item/dosa', 'item screen'],
    ['/profile', 'profile screen'],
    ['/cart', 'cart screen'],
    ['/bill', 'bill screen'],
    ['/payments', 'payments screen'],
    ['/counter-code', 'counter-code screen'],
    ['/online-payment', 'online-payment screen'],
    ['/payment-success', 'payment-success screen'],
  ])('renders %s', (route, text) => {
    renderAt(route);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('redirects unknown routes to the menu', () => {
    renderAt('/nope');
    expect(screen.getByText('menu screen')).toBeInTheDocument();
  });

  it('redirects protected routes to login when no user is stored', () => {
    localStorage.clear();
    renderAt('/menu');
    expect(screen.getByText('login screen')).toBeInTheDocument();
  });
});
