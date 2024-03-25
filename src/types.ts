import { z } from 'zod';

import { RepositoryConfSchema } from './schemas';

export type RepositoryConf = z.infer<typeof RepositoryConfSchema>;

export type menu =
	| 'home'
	| 'watch mode'
	| 'repositories'
	| 'add repository'
	| 'check repositories connection'
	| 'repository options'
	| 'repository branches'
	| 'repository side effects'
	| 'delete repository'
	| 'sync repository branches'
	| 'quit';

export interface BranchRequest {
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

export interface RepositoryRequest {
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

type MenusThatNeedId = Extract<
	menu,
	| 'repository options'
	| 'repository branches'
	| 'repository side effects'
	| 'delete repository'
	| 'sync repository branches'
>;
export type IdType<T extends menu> = T extends MenusThatNeedId ? string : null;
