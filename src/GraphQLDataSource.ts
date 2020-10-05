import { DataSourceConfig } from 'apollo-datasource';
import { ApolloLink, execute, GraphQLRequest, makePromise } from 'apollo-link';
import { setContext } from 'apollo-link-context';
import { onError } from 'apollo-link-error';
import { createHttpLink } from 'apollo-link-http';
import ApolloLinkTimeout from 'apollo-link-timeout';
import { ApolloError, AuthenticationError, ForbiddenError } from 'apollo-server-errors';
import to from 'await-to-js';
import { DocumentNode } from 'graphql';
import fetch from 'isomorphic-fetch';

export class GraphQLDataSource<TContext = any> {
  public baseURL!: string;
  public context!: TContext;

  public initialize(config: DataSourceConfig<TContext>): void {
    this.context = config.context;
  }

  public async mutation(mutation: DocumentNode, options?: GraphQLRequest) {
    // GraphQL request requires the DocumentNode property to be named query
    return this.executeSingleOperation({ ...options, query: mutation });
  }

  public async query(query: DocumentNode, options?: GraphQLRequest) {
    return this.executeSingleOperation({ ...options, query });
  }

  protected willSendRequest?(request: any): any;

  private composeLinks(): ApolloLink {
    const uri = this.resolveUri();

    const timeoutLink = new ApolloLinkTimeout(15000); // 15 seconds timeout
    const httpLink = createHttpLink({ fetch, uri });

    return ApolloLink.from([
      this.onErrorLink(),
      this.onRequestLink(),
      timeoutLink,
      httpLink,
    ]);
  }

  private didEncounterError(error: any) {
    const status = error.statusCode ? error.statusCode : null;
    let message = '';

    if (error.bodyText) {
      message = error.bodyText;
    } else if (error.result && error.result.errors && error.result.errors[0] && error.result.errors[0].message) {
      message = error.result.errors[0].message;
    }

    let apolloError: ApolloError;

    switch (status) {
      case 401:
        apolloError = new AuthenticationError(message);
        break;
      case 403:
        apolloError = new ForbiddenError(message);
        break;
      case 502:
        apolloError = new ApolloError('Bad Gateway', status);
        break;
      case 408:
        apolloError = new ApolloError('Request timeout', status);
        break;
      default:
        apolloError = new ApolloError(message, status);
    }

    throw apolloError;
  }

  private async executeSingleOperation(operation: GraphQLRequest) {
    const link = this.composeLinks();

    const [error, response] = await to(makePromise(execute(link, operation)));

    if (error) {
      this.didEncounterError(error);
    }

    return response;
  }

  private resolveUri(): string {
    const baseURL = this.baseURL;

    if (!baseURL) {
      throw new ApolloError('Cannot make request to GraphQL API, missing baseURL');
    }

    return baseURL;
  }

  private onRequestLink() {
    return setContext((_, request) => {
      if (this.willSendRequest) {
        this.willSendRequest(request);
      }

      return request;
    });
  }

  private onErrorLink() {
    // Do nothing for now
    return onError(({}) => {});
  }
}
