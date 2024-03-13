import axios from 'axios';

import { BITBUCKET_API_BASE_ENDPOINT } from './constants';
import { RepositoryConf } from './types';

function CreateConn(accessToken: string) {
	return axios.create({
		baseURL: BITBUCKET_API_BASE_ENDPOINT,
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
	});
}

async function FetchRepository(
	repository: Pick<
		RepositoryConf,
		'repository_workspace_name' | 'repository_name' | 'repository_access_token'
	>
) {
	const conn = CreateConn(repository.repository_access_token);

	const response = (
		await conn.get<RepositoryRequest>(
			`/repositories/${repository.repository_workspace_name}/${repository.repository_name}`
		)
	).data;

	return response;
}

async function FetchRepositoryBranches(
	repository: Pick<
		RepositoryConf,
		'repository_workspace_name' | 'repository_name' | 'repository_access_token'
	>
) {
	const conn = CreateConn(repository.repository_access_token);

	let next_page: string | undefined =
		`/repositories/${repository.repository_workspace_name}/${repository.repository_name}/refs/branches?pagelen=100&page=1`;
	const reduced_branches = [];

	while (next_page) {
		const current_page_req: BranchRequest = (
			await conn.get<BranchRequest>(
				next_page.replace(BITBUCKET_API_BASE_ENDPOINT, '')
			)
		).data;

		// when on last page .next will be undefined
		next_page = current_page_req.next;

		reduced_branches.push(...current_page_req.values);
	}

	return reduced_branches;
}

export { FetchRepository, FetchRepositoryBranches };

interface BranchRequest {
	pagelen: number;
	size: number;
	values: [
		{
			name: string;
			links: {
				commits: {
					href: string;
				};
				self: {
					href: string;
				};
				html: {
					href: string;
				};
			};
			default_merge_strategy: unknown;
			merge_strategies: string[];
			type: 'branch';
			target: {
				hash: string;
				repository: {
					links: {
						self: {
							href: string;
						};
						html: {
							href: string;
						};
						avatar: {
							href: string;
						};
					};
					type: 'repository';
					name: string;
					full_name: string;
					uuid: string;
				};
				links: {
					self: {
						href: string;
					};
					comments: {
						href: string;
					};
					patch: {
						href: string;
					};
					html: {
						href: string;
					};
					diff: {
						href: string;
					};
					approve: {
						href: string;
					};
					statuses: {
						href: string;
					};
				};
				author: {
					raw: string;
					type: 'author';
					user: {
						display_name: string;
						uuid: string;
						links: {
							self: {
								href: string;
							};
							html: {
								href: string;
							};
							avatar: {
								href: string;
							};
						};
						nickname: string;
						type: 'user';
						account_id: string;
					};
				};
				parents: [
					{
						hash: string;
						type: 'commit';
						links: {
							self: {
								href: string;
							};
							html: {
								href: string;
							};
						};
					},
				];
				date: string;
				message: string;
				type: 'commit';
			};
		},
	];
	page: number;
	next: string | undefined;
}

interface RepositoryRequest {
	type: 'repository';
	links: {
		self: {
			href: string;
			name: string;
		};
		html: {
			href: string;
			name: string;
		};
		avatar: {
			href: string;
			name: string;
		};
		pullrequests: {
			href: string;
			name: string;
		};
		commits: {
			href: string;
			name: string;
		};
		forks: {
			href: string;
			name: string;
		};
		watchers: {
			href: string;
			name: string;
		};
		downloads: {
			href: string;
			name: string;
		};
		clone: [
			{
				href: string;
				name: string;
			},
		];
		hooks: {
			href: string;
			name: string;
		};
	};
	uuid: string;
	full_name: string;
	is_private: true;
	scm: 'git';
	owner: {
		type: 'user';
	};
	name: string;
	description: string;
	created_on: string;
	updated_on: string;
	size: 2154;
	language: string;
	has_issues: true;
	has_wiki: true;
	fork_policy: unknown;
	project: {
		type: 'project';
	};
	mainbranch: {
		type: 'branch';
	};
}
