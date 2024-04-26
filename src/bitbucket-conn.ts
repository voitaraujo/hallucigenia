import { BITBUCKET_API_BASE_ENDPOINT } from './constants';
import { BranchRequest, RepositoryConf, RepositoryRequest } from './types';

async function FetchRepository(
	repository: Pick<
		RepositoryConf,
		'repository_workspace_name' | 'repository_name' | 'repository_access_token'
	>
) {
	const response = await fetch(
		`${BITBUCKET_API_BASE_ENDPOINT}/repositories/${repository.repository_workspace_name}/${repository.repository_name}`,
		{
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${repository.repository_access_token}`,
			},
		}
	).then((res) => {
		if (res.status >= 400) {
			throw new Error('Failed to fetch repository');
		}

		return res.json() as Promise<RepositoryRequest>;
	});

	return response;
}

async function FetchRepositoryBranches(
	repository: Pick<
		RepositoryConf,
		'repository_workspace_name' | 'repository_name' | 'repository_access_token'
	>
) {
	const pageLen = 100; // this value might change in the future!

	let branch_page: string | undefined =
		`${BITBUCKET_API_BASE_ENDPOINT}/repositories/${repository.repository_workspace_name}/${repository.repository_name}/refs/branches?pagelen=${pageLen}&page=1`;
	const reduced_branches = [];

	while (branch_page) {
		const current_page_req: BranchRequest = await fetch(branch_page, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${repository.repository_access_token}`,
			},
		}).then((res) => {
			if (res.status >= 400) {
				throw new Error('Failed to fetch repository branches');
			}

			return res.json() as Promise<BranchRequest>;
		});

		// when on last page .next will be undefined and we'll quit the while
		branch_page = current_page_req.next;

		reduced_branches.push(...current_page_req.values);
	}

	return reduced_branches;
}

export { FetchRepository, FetchRepositoryBranches };
