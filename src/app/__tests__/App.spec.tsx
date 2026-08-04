import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('../pages/QuickstartsPage', () => {
  const MockPage = () => <div data-testid="quickstarts-page">Quickstarts Page</div>;
  MockPage.displayName = 'MockQuickstartsPage';
  return { __esModule: true, default: MockPage };
});

describe('App Component', () => {
  it('should render the routes container', () => {
    render(<App />);
    expect(screen.getByTestId('routes')).toBeInTheDocument();
  });
});
