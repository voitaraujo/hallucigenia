import axios from 'axios';

import { BITBUCKET_API_BASE_ENDPOINT } from './constants';
import { BranchRequest, RepositoryConf, RepositoryRequest } from './types';

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
	const pageLen = 100; // this value might change in the future!

	let next_page: string | undefined =
		`/repositories/${repository.repository_workspace_name}/${repository.repository_name}/refs/branches?pagelen=${pageLen}&page=1`;
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
