import { z } from 'zod';

import { RepositoryConfSchema } from './schemas';

export type RepositoryConf = z.infer<typeof RepositoryConfSchema>;

export type menu =
	| 'home'
	| 'repositories'
	| 'observable repositories'
	| 'observed branches'
	| 'add repository'
	| 'quit'
	| 'repository options'
	| 'delete repository'
	| 'watch mode'
	| 'check branches'
	| 'check repos';

export interface RepositoryPulseSignal {
	repository_slug: string;
	conf: RepositoryConf;
}
