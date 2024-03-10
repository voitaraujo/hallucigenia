import { z } from 'zod';

export const HallucigeniaConfSchema = z.object({
	app_version: z.string(),
	// app_password: z.string().min(8)
});

export const Branches = z.object({
	branch_name: z.string(),
	last_commit_hash: z.string(),
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

export const RepositoryPulseSignalSchema = z.object({
	repository_slug: z.string(),
	conf: RepositoryConfSchema,
});

export const HallucigeniaStateSchema = z.object({
	menu: z.enum([
		'home',
		'repositories',
		'observable repositories',
		'observed branches',
		'add repository',
		'quit',
		'repository options',
		'delete repository',
		'sync repositories',
		'watch mode',
	]),
	repository_pulse_signals: z.array(RepositoryPulseSignalSchema),
	target_repository_id: z.string().nullable(),
});

export type HallucigeniaStateSchema = z.infer<typeof HallucigeniaStateSchema>;
export type RepositoryPulseSignalSchema = z.infer<
	typeof RepositoryPulseSignalSchema
>;
export type HallucigeniaConfSchema = z.infer<typeof HallucigeniaConfSchema>;
export type RepositoryConfSchema = z.infer<typeof RepositoryConfSchema>;
