import { render, screen, fireEvent } from '@testing-library/react';
import QuickstartsPage from '../QuickstartsPage';

const mockOnSelect = jest.fn();
jest.mock('~/app/components/ProjectSelector', () => ({
  ProjectSelector: ({ selectedProject, onSelect }: { selectedProject: string | null; onSelect: (p: string | null) => void }) => {
    mockOnSelect.mockImplementation(onSelect);
    return (
      <div data-testid="project-selector">
        {selectedProject ?? 'none'}
        <button data-testid="select-project" onClick={() => onSelect('test-project')}>
          Select
        </button>
      </div>
    );
  },
}));

jest.mock('~/app/hooks/useLastSelectedProject', () => ({
  useLastSelectedProject: () => [null, jest.fn()],
}));

describe('QuickstartsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the project selector', () => {
    render(<QuickstartsPage />);
    expect(screen.getByTestId('project-selector')).toBeInTheDocument();
  });

  it('should show prompt to select a project when none is selected', () => {
    render(<QuickstartsPage />);
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it('should show project context after selection', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));
    expect(
      screen.getByText(/catalog and status views for project/i),
    ).toBeInTheDocument();
  });
});
