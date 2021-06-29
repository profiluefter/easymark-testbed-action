# [EasyMark](https://github.com/T0astBread/EasyMark) Testbed Submission Action 

This action submits the repository (or a subdirectory) to an [EasyMark](https://github.com/T0astBread/EasyMark) instance for automated testing.

## Inputs

### `easymark-instance`
**Required**  
The base URL of the EasyMark instance to submit to.  
Example: `https://example.org/`

### `easymark-token`
**Required**  
Your login token for EasyMark. There is currently no way to allow a program access to your account (probably by design) so you have to provide your login token to this action.  
**You should use [Secrets](https://docs.github.com/en/actions/reference/encrypted-secrets#using-encrypted-secrets-in-a-workflow) to prevent your access token from being leaked.**

### `task-id`
**Required**  
The internal ID of the task. You can find it in the second line of the log when you submit something for this task, or you can find it in a `form` element using your browsers dev tools.

### `directory`
If your submission is not the whole repository but instead a subfolder, you can specify the directory that should be zipped here.

### `timeout`
At the time of writing there is (supposedly) a bug in EasyMark that does not mark runs as finished. They will remain in the `RUNNING` state for a long time and the action would have to wait for it to finish.

To avoid waiting for too long you can specify the time that the action should wait for the run to finish. If the run doesn't finish in time the current output will be printed and the output state will be set to `TIMEOUT`. The value of this parameter is roughly equivalent to seconds of waiting.

## Outputs

### `status`

The status of the submission will be provided in this variable. The action will fail when an error occurs and additionally the status output variable will contain the status code.

|Value|Description|
|---|---|
|`SUCCESS`|All tests passed successfully.|
|`ERROR`|Something is wrong with your submission. Either it doesn't compile or tests are failing.|
|`CANCELLED`|The test run was cancelled in the web interface while it was running.|
|`TIMEOUT`|EasyMark didn't report a valid status in the defined timeout period.|
|`FINISHED_EASYMARK_ERROR`|EasyMark encountered an internal error.|

## Example usage

```yaml
name: EasyMark Test
on:
  push:

jobs:
  easymark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Submit to EasyMark
        uses: profiluefter/easymark-testbed-action@v0.1.2
        with:
          easymark-instance: ${{ secrets.EASYMARK_INSTANCE }}
          easymark-token: ${{ secrets.EASYMARK_TOKEN }}
          task-id: a80acdbf-61bd-411c-b171-23185e70f76a
```

## Todo

* The action currently does not log itself out, so you will end up with many open sessions. This could be solved using a cleanup script or directly in the action.