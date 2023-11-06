import * as core from '@actions/core'
import {create, UploadOptions} from '@actions/artifact'
import {findFilesToUpload} from './search'
import {getInputs} from './input-helper'
import {NoFileOptions, Inputs} from './constants'
import * as tar from 'tar'
import * as fs from 'fs'

async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    const searchResult = await findFilesToUpload(inputs.searchPath)
    if (searchResult.filesToUpload.length === 0) {
      // No files were found, different use cases warrant different types of behavior if nothing is found
      switch (inputs.ifNoFilesFound) {
        case NoFileOptions.warn: {
          core.warning(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`
          )
          break
        }
        case NoFileOptions.error: {
          core.setFailed(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`
          )
          break
        }
        case NoFileOptions.ignore: {
          core.info(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`
          )
          break
        }
      }
    } else {
      const s = searchResult.filesToUpload.length === 1 ? '' : 's'
      core.info(
        `With the provided path, there will be ${searchResult.filesToUpload.length} file${s} uploaded`
      )
      core.debug(`Root artifact directory is ${searchResult.rootDirectory}`)

      if (searchResult.filesToUpload.length > 10000) {
        core.warning(
          `There are over 10,000 files in this artifact, consider creating an archive before upload to improve the upload performance.`
        )
      }

      let artifacts: string[] = []
      const alwaysCompress = core.getInput(Inputs.AlwaysCompress)

      if (searchResult.filesToUpload.length > 20 || alwaysCompress == 'true') {
        const outputFileName = 'compressed-artifact.tar'

        const outputTarStream = fs.createWriteStream(outputFileName)
        const pack = tar.c({cwd: './'}, searchResult.filesToUpload)

        pack.pipe(outputTarStream)

        outputTarStream.on('close', () => {
          core.info(`File(s) compressed to ${outputFileName}`)
        })

        outputTarStream.on('error', err => {
          core.error(`Error compressing files: ${err}`)
        })
        artifacts = [outputFileName]
      } else {
        core.info(
          "Didn't compress, not worth it, to override to always compress, set the input `always-compress` to true"
        )
        artifacts = searchResult.filesToUpload
      }

      
      const currentDirectory = './'; // Use '.' for the current directory

      fs.readdir(currentDirectory, (err, files) => {
        if (err) {
          core.error(`Error reading directory ${currentDirectory}: ${err}`);
        } else {
          core.info(`Contents of ${currentDirectory}:`);
          files.forEach((file) => {
            core.info(file);
          });
        }
      });

      const artifactClient = create()
      const options: UploadOptions = {
        continueOnError: false
      }

      if (inputs.retentionDays) {
        options.retentionDays = inputs.retentionDays
      }

      const uploadResponse = await artifactClient.uploadArtifact(
        inputs.artifactName,
        artifacts,
        searchResult.rootDirectory,
        options
      )

      if (uploadResponse.failedItems.length > 0) {
        core.setFailed(
          `An error was encountered when uploading ${uploadResponse.artifactName}. There were ${uploadResponse.failedItems.length} items that failed to upload.`
        )
      } else {
        core.info(
          `Artifact ${uploadResponse.artifactName} has been successfully uploaded!`
        )
      }
    }
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}

run()
