/** @typedef {import("../stores/Tasks").TaskModel} Task */
/** @typedef {import("label-studio").LabelStudio} LabelStudio */
/** @typedef {import("./dm-sdk").DataManager} DataManager */
/** @typedef {{
 * user: Dict
 * config: string,
 * interfaces: string[],
 * task: Task
 * }} LSFOptions */

import { LabelStudio } from "label-studio";
import { LSFHistory } from "./lsf-history";
import { completionToServer, taskToLSFormat } from "./lsf-utils";

const DEFAULT_INTERFACES = [
  "basic",
  "panel", // undo, redo, reset panel
  "controls", // all control buttons: skip, submit, update
  "submit", // submit button on controls
  "update", // update button on controls
  "predictions",
  "predictions:menu", // right menu with prediction items
  "completions:menu", // right menu with completion items
  "completions:add-new",
  "completions:delete",
  "side-column", // entity
  "skip",
];

export class LSFWrapper {
  /** @type {HTMLElement} */
  root = null;

  /** @type {DataManager} */
  datamanager = null;

  /** @type {Task} */
  task = null;

  /** @type {Completion} */
  initialCompletion = null;

  /** @type {LabelStudio} */
  lsf = null;

  /** @type {LSFHistory} */
  history = null;

  /**
   *
   * @param {DataManager} dm
   * @param {HTMLElement} element
   * @param {LSFOptions} options
   */
  constructor(dm, element, options) {
    console.log("Initializing LabelStudio");

    this.datamanager = dm;
    this.root = element;
    this.task = options.task;
    this.initialCompletion = options.completion;
    this.history = this.datamanager.isLabelStream ? new LSFHistory(this) : null;

    console.log(this.initialCompletion);

    const lsfProperties = {
      user: options.user,
      config: this.lsfConfig,
      task: taskToLSFormat(this.task),
      description: this.instructions,
      interfaces: this.buildInterfaces(options.interfaces),
      onLabelStudioLoad: this.onLabelStudioLoad,
      onTaskLoad: this.onTaskLoad,
      onSubmitCompletion: this.onSubmitCompletion,
      onUpdateCompletion: this.onUpdateCompletion,
      onDeleteCompletion: this.onDeleteCompletion,
      onSkipTask: this.onSkipTask,
      onGroundTruth: this.onGroundTruth,
    };

    try {
      new LabelStudio(this.root, lsfProperties);
    } catch (err) {
      console.error("Failed to initialize LabelStudio", lsfProperties);
      console.error(err);
    }
  }

  /** @private */
  async loadTask(taskID, completionID) {
    if (!this.lsf)
      return console.error("Make sure that LSF was properly initialized");

    if (taskID === undefined) console.info("Load next task");
    else console.info(`Reloading task ${taskID}`);

    this.setLoading(true);
    const tasks = this.datamanager.store.taskStore;
    const newTask = await tasks.loadTask(taskID);

    this.task = newTask;

    /**
     * Add new data from received task
     */
    try {
      this.resetLabelStudio();
      this.setTask(newTask);
      this.setCompletion(completionID);
    } catch (err) {
      console.error("Failed to attach new task", err);
    }

    this.setLoading(false);
  }

  /** @private */
  resetLabelStudio() {
    this.lsf.resetState();
  }

  /** @private */
  setTask(task) {
    console.log("The store is being re-initiailized", { task });
    this.lsf.assignTask(task);
    this.lsf.initializeStore(taskToLSFormat(task));
  }

  /** @private */
  setCompletion(id) {
    let { completionStore: cs } = this.lsf;
    let completion;

    if (this.predictions.length > 0) {
      console.log("Added from prediction");
      completion = cs.addCompletionFromPrediction(this.predictions[0]);
    } else if (this.completions.length > 0 && id !== undefined) {
      console.log("Existing ID taken");
      // we are on history item, take completion id from history
      completion = { id };
    } else {
      console.log("Completion generated");
      completion = cs.addCompletion({ userGenerate: true });
    }

    if (completion.id) cs.selectCompletion(completion.id);
  }

  /** @private */
  buildInterfaces(interfaces) {
    const result = interfaces ? interfaces : DEFAULT_INTERFACES;

    if (this.datamanager.isLabelStream) result.push("skip");

    return result;
  }

  onLabelStudioLoad = async (ls) => {
    this.lsf = ls;
    this.setLoading(true);

    if (this.datamanager.mode === "labelstream") {
      await this.loadTask();
    } else if (this.task) {
      const completionID =
        this.initialCompletion?.id ?? this.task.lastCompletion?.id;
      console.log({ completionID });
      console.log(this.task);
      console.log(this.lsf.completionStore.completions.length);
      this.setCompletion(completionID);
    }

    this.setLoading(false);
  };

  /** @private */
  onSubmitCompletion = async (ls, completion) => {
    await this.submitCurrentCompletion("submitCompletion", (taskID, body) =>
      this.datamanager.api.submitCompletion({ taskID }, { body })
    );
  };

  /** @private */
  onUpdateCompletion = async (ls, completion) => {
    this.setLoading(true);

    console.log("saving completion", { completion });
    const result = await this.datamanager.api.updateCompletion(
      {
        completionID: completion.pk,
      },
      {
        body: this.prepareData(completion),
      }
    );

    this.datamanager.invoke("updateCompletion", ls, completion, result);

    await this.loadTask(this.task.id, completion.pk);

    this.setLoading(false);
  };

  /**@private */
  onDeleteCompletion = async (ls, completion) => {
    this.setLoading(true);

    const { task } = this;

    const response = await this.datamanager.api.deleteCompletion({
      taskID: task.id,
      completionID: completion.pk,
    });

    task.update(response);
    await this.loadTask(task.id, task.lastCompletion?.id);

    this.setLoading(false);
  };

  onSkipTask = async (ls) => {
    await this.submitCurrentCompletion("skipTask", (taskID, body) =>
      this.datamanager.api.skipTask({ taskID }, { body })
    );
  };

  async submitCurrentCompletion(eventName, submit) {
    this.setLoading(true);

    const { taskID, currentCompletion } = this;
    console.log({ taskID, currentCompletion });
    const result = await submit(taskID, this.prepareData(currentCompletion));

    if (result && result.id !== undefined) {
      currentCompletion.updatePersonalKey(result.id.toString());

      const eventData = completionToServer(currentCompletion);
      this.datamanager.invoke(eventName, this.lsf, eventData, result);

      this.history?.add(taskID, currentCompletion.pk);
    }

    if (this.datamanager.isExplorer) {
      console.log(`Reload task ${taskID} as DataManager is in Explorer mode`);
      await this.loadTask(taskID, currentCompletion.pk);
    } else {
      console.log(`Load next task as DataManager is in LabelStream mode`);
      await this.loadTask();
    }

    this.setLoading(false);
  }

  /** @private */
  prepareData(completion, includeId) {
    const result = {
      lead_time: (new Date() - completion.loadedDate) / 1000, // task execution time
      result: completion.serializeCompletion(),
    };

    if (includeId) {
      result.id = parseInt(completion.id);
    }

    return result;
  }

  /** @private */
  setLoading(loading) {
    this.lsf.setFlags({ loading });
  }

  get taskID() {
    return this.task.id;
  }

  get currentCompletion() {
    return this.lsf.completionStore.selected;
  }

  get completions() {
    return this.lsf.completionStore.completions;
  }

  get predictions() {
    return this.lsf.completionStore.predictions;
  }

  /** @returns {string|null} */
  get lsfConfig() {
    return this.project.label_config_line;
  }

  /** @returns {Dict} */
  get project() {
    return this.datamanager.store.project;
  }

  /** @returns {string|null} */
  get instructions() {
    return (this.project.instructions ?? "").trim() || null;
  }
}
