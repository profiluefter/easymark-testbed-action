const core = require("@actions/core");
const htmlParser = require("node-html-parser");
const setCookieParser = require("set-cookie-parser");
const AdmZip = require("adm-zip");
const FormData = require("form-data");
const {Readable} = require("stream");

const axios = require("axios").create({
    baseURL: core.getInput("easymark-instance"),
    maxRedirects: 0
});

async function login(token) {
    const loginPage = await axios.get("/", {responseType: "text"});
    const csrfToken = htmlParser.parse(loginPage.data).querySelector("[name=\"csrfToken\"]").getAttribute("value");
    const cookie = setCookieParser(loginPage.headers["set-cookie"][0])[0].value;

    try {
        await axios.post("/login", new URLSearchParams({
            accessToken: token,
            csrfToken
        }), {
            responseType: "text",
            headers: {"Cookie": "JSESSIONID=" + cookie}
        });
    } catch(e) {
        if(e.message !== "Request failed with status code 302")
            throw e;
        return setCookieParser(e.response.headers["set-cookie"][0])[0].value;
    }

    throw Error("Expected 302 after login.");
}

function createZIP(directory) {
    const zip = new AdmZip();
    zip.addLocalFolder(directory);
    return zip.toBuffer();
}

async function uploadSubmission(cookie, assignmentID, zipBuffer) {
    const dashboard = await axios.get("/", {responseType: "text", headers: {"Cookie": "JSESSIONID=" + cookie}});
    const csrfToken = htmlParser.parse(dashboard.data)
        .querySelector(`[name="assignmentId"][value="${assignmentID}"]`)
        .parentNode
        .querySelector(`[name="csrfToken"]`)
        .getAttribute("value");

    const form = new FormData();

    form.append("submissionFile", new Readable({
        read() {
            this.push(zipBuffer);
            this.push(null);
        }
    }), {
        contentType: "application/x-zip-compressed",
        filename: "submission.zip"
    });
    form.append("assignmentId", assignmentID);
    form.append("csrfToken", csrfToken);

    const formHeaders = form.getHeaders();
    try {
        await axios.post("/test-tasks", form, {
            headers: {
                "Content-Type": "multipart/form-data",
                "Cookie": "JSESSIONID=" + cookie,
                ...formHeaders
            }
        });
    } catch(e) {
        if(e.message !== "Request failed with status code 302")
            throw e;
        let location = e.response.headers["location"];
        return location.match(/\/test-tasks\/([0-9a-z-]+)/)[1];
    }

    throw Error("Expected 302 after login.");
}

async function getTaskStatus(cookie, taskID) {
    const statusResponse = await axios.get(`/test-tasks/${taskID}/progress-update?problemsToSkip=0`, {
        headers: {
            "Cookie": "JSESSIONID=" + cookie
        }
    });

    return statusResponse.data;
}

(async () => {
    core.startGroup("Login");
    let token = core.getInput("easymark-token");
    core.setSecret(token);
    console.log(`Logging in with token ${token}...`);
    const cookie = await login(token);
    core.setSecret(cookie);
    core.debug(`Successfully logged in with cookie JSESSIONID=${cookie}.`);
    core.endGroup();

    core.startGroup("Submit");
    let assignmentID = core.getInput("task-id");
    const taskID = await uploadSubmission(cookie, assignmentID, createZIP(core.getInput("directory")));
    core.debug("Uploaded submission.");
    core.endGroup();

    core.startGroup("Checking status...");
    let status = await getTaskStatus(cookie, taskID);

    let checks = 0;
    const maxChecks = core.getInput("timeout");

    while(status.status === "RUNNING" && checks <= maxChecks) {
        checks++;
        console.log("Checking status...");
        await new Promise(i => setTimeout(i, 1000));
        status = await getTaskStatus(cookie, taskID);
    }
    core.endGroup();

    core.info(status.output);
    core.setOutput("status", status.status === "RUNNING" ? "TIMEOUT" : status.status);

    switch(status.status) {
        case "RUNNING":
            core.warning("Run timed out. This might be a problem with EasyMark or the timeout is set too low.");
            core.setOutput("status", "TIMEOUT");
            break;
        case "FINISHED_EASYMARK_ERROR":
            core.setFailed("EasyMark returned error code FINISHED_EASYMARK_ERROR.");
            core.setOutput("status", "FINISHED_EASYMARK_ERROR");
            break;
        case "CANCELLED":
            core.setFailed("Run got cancelled.");
            core.setOutput("status", "CANCELLED");
            break;
        case "FINISHED_SUCCESS":
            if(status.problemsHTML === "") {
                core.info("Run succeeded without problems.");
                core.setOutput("status", "SUCCESS");
            } else {
                core.setFailed("Errors occurred while testing!");
                core.setOutput("status", "ERROR");
            }
            break;
        default:
            core.warning(`Unknown EasyMark status code: ${status.status}`);
            core.setOutput("status", "UNKNOWN");
            break;
    }
})().catch(e => core.setFailed(e.message));
