import { FetchRepository } from './bitbucket-conn';
import { RepositoryConf } from './types';

const ValidatorsByContext = {
	bitbucket: {
		repository_name: async (
			newRepositoryBitBucketData: Pick<
				RepositoryConf,
				'repository_workspace_name' | 'repository_name'
			>,
			repositories_confs: RepositoryConf[]
		) => {
			for (const rc of repositories_confs) {
				const sameWS =
					rc.repository_workspace_name ===
					newRepositoryBitBucketData.repository_workspace_name;
				const sameR =
					rc.repository_name === newRepositoryBitBucketData.repository_name;

				if (sameWS && sameR) {
					return 'There is a repository already using this repository name on the same workspace, you are probably duplicating it';
				}
			}

			return true;
		},
		access_token: async (
			newRepositoryBitBucketData: Pick<
				RepositoryConf,
				| 'repository_workspace_name'
				| 'repository_name'
				| 'repository_access_token'
			>
		) => {
			try {
				await FetchRepository({
					repository_access_token:
						newRepositoryBitBucketData.repository_access_token,
					repository_workspace_name:
						newRepositoryBitBucketData.repository_workspace_name,
					repository_name: newRepositoryBitBucketData.repository_name,
				});

				return true;
			} catch (err) {
				return 'Could not establish connection with the remote repository';
			}
		},
		slug: async (newRepoSlug: string, repository_slugs: string[]) => {
			for (const rs of repository_slugs) {
				if (rs === newRepoSlug) {
					return 'There is already a repository using this slug';
				}
			}

			return true;
		},
	},
	// probably never using this, just for testing the types
	github: {
		test: undefined,
	},
} satisfies {
	[K: string]: {
		[K: string]: // eslint-disable-next-line
		| ((...args: any[]) => string | boolean | Promise<string | boolean>)
			| undefined;
	};
};

function GetValidatorFunction<
	T extends keyof typeof ValidatorsByContext,
	Q extends keyof (typeof ValidatorsByContext)[T],
>(context: T, validatorName: Q): (typeof ValidatorsByContext)[T][Q] {
	if (!ValidatorsByContext[context])
		throw new Error('Requested context not available');

	if (!ValidatorsByContext[context][validatorName])
		throw new Error('Requested validator not available on context');

	return ValidatorsByContext[context][validatorName];
}

export { GetValidatorFunction };
