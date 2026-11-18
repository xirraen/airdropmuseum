/**
 * Resolve only a newly created direct-child backup directory under the
 * operator's private root. Refuse symlinks, escape paths and non-directories.
 */
import {lstatSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute,sep} from 'node:path';

export function resolveNewPrivateBackupFolder(root,candidate){
 if(typeof candidate!=='string'||!candidate||
    candidate==='.'||candidate==='..'||candidate.includes('/')||
    candidate.includes('\\')||candidate.includes('\0'))
  throw Error('BACKUP_ESCAPED_PRIVATE_DIRECTORY');
 const base=realpathSync(root);
 const candidatePath=join(base,candidate);
 const kind=lstatSync(candidatePath);
 if(!kind.isDirectory()||kind.isSymbolicLink())
  throw Error('BACKUP_ESCAPED_PRIVATE_DIRECTORY');
 const folder=realpathSync(candidatePath);
 const rel=relative(base,folder);
 if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||rel.includes(sep))
  throw Error('BACKUP_ESCAPED_PRIVATE_DIRECTORY');
 return folder;
}
