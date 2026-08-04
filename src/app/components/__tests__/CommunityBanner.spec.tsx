import { render, screen } from '@testing-library/react';
import CommunityBanner from '../CommunityBanner';

describe('CommunityBanner', () => {
  it('should render the community plugin text', () => {
    render(<CommunityBanner />);
    expect(screen.getByText('Community Plugin')).toBeInTheDocument();
  });

  it('should have the community-plugin-banner class', () => {
    render(<CommunityBanner />);
    expect(screen.getByText('Community Plugin')).toHaveClass(
      'community-plugin-banner',
    );
  });
});
