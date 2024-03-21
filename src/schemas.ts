import { z } from 'zod';

export const Branches = z.object({
	branch_name: z.string(),
	hash: z.string().optional(),
});

export const RepositoryConfSchema = z.object({
	repository_id: z.string(),
	repository_name: z.string(),
	repository_access_token: z.string(),
	repository_workspace_name: z.string(),
	branches: z.array(Branches),
	observed_branches: z.array(Branches),
	remote_connection_status: z.enum(['ok', 'ko']),
});
