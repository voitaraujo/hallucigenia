import { homedir } from 'os';
import path from 'path';

const APP_PATH_IDENTIFIER = path.join(homedir(), '.hallucigenia');
const CONFIGURATION_FILE_IDENTIFIER = '.conf';
const REPOSITORIES_PATH_IDENTIFIER = path.join(
	APP_PATH_IDENTIFIER,
	'repositories'
);
const BITBUCKET_API_BASE_ENDPOINT = 'https://api.bitbucket.org/2.0';
const SPINNER_CONFIGURATION = {
	frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], // normaly inquirer already has this by default but for some reason it appears buggy on my terminal, explicitly using this array ensure the expected behavior tho.
	interval: 100,
};

export {
  APP_PATH_IDENTIFIER,
	BITBUCKET_API_BASE_ENDPOINT,
	CONFIGURATION_FILE_IDENTIFIER,
	REPOSITORIES_PATH_IDENTIFIER,
	SPINNER_CONFIGURATION,
};
