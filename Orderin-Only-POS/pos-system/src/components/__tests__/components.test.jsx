import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Bell } from 'lucide-react';
import EmptyState from '../EmptyState';
import StatusBadge from '../StatusBadge';
import StatCard from '../StatCard';
import Modal from '../Modal';
import ConfirmDialog from '../ConfirmDialog';

describe('EmptyState', () => {
  it('renders the title, subtitle and an action', () => {
    render(<EmptyState icon={Bell} title="Nothing here" subtitle="Add one to begin" action={<button>New</button>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Add one to begin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('matches the snapshot', () => {
    const { asFragment } = render(<EmptyState title="Empty" />);
    expect(asFragment()).toMatchSnapshot();
  });
});

describe('StatusBadge', () => {
  it('maps a known status to its tone and label', () => {
    const { container } = render(<StatusBadge status="ready" />);
    const badge = container.querySelector('.badge');
    expect(badge).toHaveClass('badge-success');
    expect(badge).toHaveTextContent('Ready');
  });

  it('uses the custom text override when present', () => {
    render(<StatusBadge status="in_stock" />);
    expect(screen.getByText('In Stock')).toBeInTheDocument();
  });

  it('falls back to a neutral dash for an empty status', () => {
    const { container } = render(<StatusBadge status={undefined} />);
    expect(container.querySelector('.badge')).toHaveClass('badge-neutral');
    expect(container).toHaveTextContent('—');
  });
});

describe('StatCard', () => {
  it('renders the label, value and sub text', () => {
    render(<StatCard label="Revenue" value="₹1,200" icon={Bell} sub="today" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('₹1,200')).toBeInTheDocument();
    expect(screen.getByText('today')).toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(<Modal open={false} title="Hi">body</Modal>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the title, children and footer when open', () => {
    render(<Modal open title="Edit Item" footer={<button>Save</button>}>the body</Modal>);
    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument();
    expect(screen.getByText('the body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal open title="X" onClose={onClose}>b</Modal>);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  it('renders the message and confirm/cancel buttons', () => {
    render(<ConfirmDialog open title="Delete?" message="This cannot be undone" confirmLabel="Delete" danger onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('This cannot be undone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('wires the confirm and cancel callbacks', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open message="sure?" onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
