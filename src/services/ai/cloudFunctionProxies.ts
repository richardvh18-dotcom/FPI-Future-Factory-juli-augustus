
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase'; // Ensure functions is exported
import * as contextProviders from './contextProviders';
import * as promptBuilders from './promptBuilders';
import { getErrorMessage, asRecord } from '../aiService';

const availableModel = 'gemini-2.5-flash';


