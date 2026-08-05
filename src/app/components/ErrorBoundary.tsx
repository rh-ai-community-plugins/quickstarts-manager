import React from 'react';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
  Button,
  PageSection,
} from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <PageSection hasBodyWrapper={false}>
          <EmptyState
            headingLevel="h2"
            titleText="Something went wrong"
            icon={ExclamationCircleIcon}
            variant="lg"
          >
            <EmptyStateBody>
              An unexpected error occurred. Try reloading the page or click below
              to retry.
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="primary" onClick={this.handleReset}>
                  Retry
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        </PageSection>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
