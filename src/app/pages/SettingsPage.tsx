import React, { useState, useEffect } from 'react';
import {
  PageSection,
  Form,
  FormGroup,
  TextInput,
  ActionGroup,
  Button,
  Alert,
  EmptyState,
  EmptyStateBody,
  Spinner,
  Content,
} from '@patternfly/react-core';
import { useSettings } from '~/app/hooks/useSettings';
import { useCurrentUser } from '~/app/hooks/useCurrentUser';

const SettingsPage: React.FC = () => {
  const currentUser = useCurrentUser();
  const { settings, loading, error, saving, save, remove } = useSettings();
  const [proxyUrl, setProxyUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setProxyUrl(settings.proxyUrl ?? '');
      setGithubToken('');
    }
  }, [settings]);

  if (currentUser.loading || loading) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Spinner aria-label="Loading settings" />
      </PageSection>
    );
  }

  if (currentUser.user && !currentUser.user.isAdmin) {
    return (
      <PageSection hasBodyWrapper={false}>
        <EmptyState headingLevel="h2" titleText="Access denied">
          <EmptyStateBody>
            You need cluster-admin permissions to access plugin settings.
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  const handleSave = async () => {
    setSuccess(null);
    const values: { githubToken?: string; proxyUrl?: string } = {};
    if (githubToken) values.githubToken = githubToken;
    if (proxyUrl) values.proxyUrl = proxyUrl;
    await save(values);
    setSuccess('Settings saved successfully.');
    setGithubToken('');
  };

  const handleClear = async () => {
    setSuccess(null);
    await remove();
    setProxyUrl('');
    setGithubToken('');
    setSuccess('Settings cleared.');
  };

  return (
    <PageSection hasBodyWrapper={false}>
      <Content component="h1" className="pf-v6-u-mb-lg">Settings</Content>

      {success && !error && (
        <Alert
          variant="success"
          title={success}
          isInline
          className="pf-v6-u-mb-md"
          timeout={5000}
          onTimeout={() => setSuccess(null)}
        />
      )}
      {error && (
        <Alert
          variant="danger"
          title="Error"
          isInline
          className="pf-v6-u-mb-md"
        >
          {error}
        </Alert>
      )}

      {settings?.source && settings.source !== 'default' && (
        <Alert
          variant="info"
          title={`Settings loaded from ${settings.source === 'secret' ? 'Kubernetes Secret' : 'environment variables'}`}
          isInline
          className="pf-v6-u-mb-md"
        />
      )}

      <Form isWidthLimited>
        <FormGroup
          label="GitHub token"
          fieldId="github-token"
        >
          <TextInput
            id="github-token"
            type="password"
            value={githubToken}
            onChange={(_event, value) => setGithubToken(value)}
            placeholder={settings?.githubToken ? settings.githubToken : 'Enter GitHub personal access token'}
            aria-label="GitHub personal access token"
          />
          <Content component="small" className="pf-v6-u-mt-xs pf-v6-u-color-200">
            Optional. Raises the GitHub API rate limit from 60 to 5,000 requests per hour.
          </Content>
        </FormGroup>

        <FormGroup
          label="Proxy URL"
          fieldId="proxy-url"
        >
          <TextInput
            id="proxy-url"
            type="url"
            value={proxyUrl}
            onChange={(_event, value) => setProxyUrl(value)}
            placeholder="http://proxy:3128"
            aria-label="HTTP proxy URL"
          />
          <Content component="small" className="pf-v6-u-mt-xs pf-v6-u-color-200">
            HTTP or HTTPS proxy for outbound GitHub API requests from the BFF.
          </Content>
        </FormGroup>

        <ActionGroup>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={saving}
            isDisabled={saving || (!githubToken && !proxyUrl)}
            aria-label="Save settings"
          >
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={handleClear}
            isDisabled={saving || settings?.source === 'default'}
            aria-label="Clear settings"
          >
            Clear
          </Button>
        </ActionGroup>
      </Form>
    </PageSection>
  );
};

export default SettingsPage;
