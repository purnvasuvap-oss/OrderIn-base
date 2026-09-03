import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../DataTable';

const columns = [
  { header: 'Name', accessor: 'name' },
  { header: 'City', accessor: 'city' },
  {
    header: 'Status',
    accessor: 'status',
    render: (value: unknown) => <span data-testid="status-cell">{String(value).toUpperCase()}</span>,
  },
];

const data = [
  { name: 'Spice Villa', city: 'Chennai', status: 'active' },
  { name: 'Curry House', city: 'Mumbai', status: 'inactive' },
];

describe('DataTable', () => {
  it('matches the snapshot with populated data', () => {
    const { asFragment } = render(<DataTable columns={columns} data={data} />);
    expect(asFragment()).toMatchSnapshot();
  });

  it('renders a header for every column', () => {
    // Arrange & Act
    render(<DataTable columns={columns} data={data} />);

    // Assert
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
  });

  it('renders one row per data item and uses custom cell renderers', () => {
    // Arrange & Act
    render(<DataTable columns={columns} data={data} />);

    // Assert
    expect(screen.getByText('Spice Villa')).toBeInTheDocument();
    expect(screen.getByText('Curry House')).toBeInTheDocument();
    expect(screen.getAllByTestId('status-cell').map((el) => el.textContent)).toEqual([
      'ACTIVE',
      'INACTIVE',
    ]);
  });

  it('shows the empty state when data is an empty array', () => {
    // Arrange & Act
    render(<DataTable columns={columns} data={[]} />);

    // Assert
    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.queryByText('Spice Villa')).not.toBeInTheDocument();
  });

  it('calls onRowClick with the clicked row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} onRowClick={onRowClick} />);

    // Act
    await user.click(screen.getByText('Curry House'));

    // Assert
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
  });

  it('does not throw when a row is clicked without an onRowClick handler', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<DataTable columns={columns} data={data} />);

    // Act & Assert
    await expect(user.click(screen.getByText('Spice Villa'))).resolves.not.toThrow();
  });
});
