import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('../components/CommunityBanner', () => ({
  __esModule: true,
  default: () => <div data-testid="community-banner">Community Plugin</div>,
}));

jest.mock('../components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

jest.mock('../pages/QuickstartsPage', () => ({
  __esModule: true,
  default: () => <div data-testid="quickstarts-page">Quickstarts Page</div>,
}));

describe('App', () => {
  it('should render the community banner', () => {
    render(<App />);
    expect(screen.getByTestId('community-banner')).toBeInTheDocument();
  });

  it('should wrap content in an error boundary', () => {
    render(<App />);
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
  });

  it('should have the community-plugin-layout container', () => {
    const { container } = render(<App />);
    expect(
      container.querySelector('.community-plugin-layout'),
    ).toBeInTheDocument();
  });

  it('should redirect to quickstarts route by default', () => {
    render(<App />);
    const navigate = screen.getByTestId('navigate');
    expect(navigate).toHaveAttribute('data-to', 'quickstarts');
  });
});
