const vscode = require('vscode');
const path = require('path');

class TaskTrackerProvider {
    constructor(context) {
        this.context = context;
        this._onDidChange = new vscode.EventEmitter();
        this.tasks = this.context.globalState.get('vsc-tasks', []);
    }

    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.context.extensionUri
            ]
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'addTask':
                    this.addTask(data.task);
                    break;
                case 'deleteTask':
                    this.deleteTask(data.id);
                    break;
            }
        });
    }

    addTask(taskData) {
        const task = {
            id: Date.now().toString(),
            title: taskData.title,
            description: taskData.description,
            createdAt: new Date().toISOString()
        };
        
        this.tasks.push(task);
        this.saveTasks();
        this.updateView();
    }

    deleteTask(id) {
        const taskToDelete = this.tasks.find(task => task.id === id);
        this.tasks = this.tasks.filter(task => task.id !== id);
        this.saveTasks();
        this.updateView();
        
        if (taskToDelete) {
            vscode.window.showInformationMessage(`Task "${taskToDelete.title}" deleted`);
        }
    }

    saveTasks() {
        this.context.globalState.update('vsc-tasks', this.tasks);
    }

    updateView() {
        if (this.webviewView) {
            this.webviewView.webview.html = this.getHtml(this.webviewView.webview);
        }
    }

    getHtml(webview) {
        const tasksHtml = this.tasks.map(task => `
            <div class="task-item" data-task-id="${task.id}">
                <div class="task-content">
                    <div class="task-title">${this.escapeHtml(task.title)}</div>
                    ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                </div>
                <div class="task-actions">
                    <button class="delete-btn" title="Delete task">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11 3h4v1h-1v11c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V4H1V3h4V1c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2zM6 2h4v1H6V2zm-2 2v10h8V4H4zm3 2h1v6H7V6zm2 0h1v6H9V6z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VSTask</title>
    <style>
        body {
            padding: 10px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            background-color: transparent;
            margin: 0;
        }

        .task-form {
            margin-bottom: 15px;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }

        .form-input {
            width: 100%;
            margin-bottom: 8px;
            padding: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            box-sizing: border-box;
            font-family: var(--vscode-font-family);
        }

        .form-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        #task-description {
            min-height: 60px;
            resize: vertical;
        }

        .add-btn {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
        }

        .add-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .add-btn:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            cursor: not-allowed;
        }

        .tasks-container {
            max-height: 400px;
            overflow-y: auto;
        }

        .task-item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 10px;
            margin-bottom: 8px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .task-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .task-content {
            flex-grow: 1;
            min-width: 0;
            margin-right: 10px;
        }

        .task-title {
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
            word-wrap: break-word;
        }

        .task-description {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            opacity: 0.8;
            word-wrap: break-word;
            line-height: 1.3;
        }

        .task-actions {
            flex-shrink: 0;
        }

        .delete-btn {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
        }

        .delete-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
            opacity: 1;
        }

        .empty-state {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="task-form">
        <input type="text" id="task-title" class="form-input" placeholder="Task title" />
        <textarea id="task-description" class="form-input" placeholder="Task description (optional)"></textarea>
        <button id="add-task" class="add-btn">Add Task</button>
    </div>

    <div class="tasks-container" id="tasks-container">
        ${this.tasks.length > 0 ? tasksHtml : '<div class="empty-state">No tasks yet. Add your first task above!</div>'}
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Elements
        const taskTitle = document.getElementById('task-title');
        const taskDescription = document.getElementById('task-description');
        const addButton = document.getElementById('add-task');
        const tasksContainer = document.getElementById('tasks-container');

        // Add task
        addButton.addEventListener('click', () => {
            const title = taskTitle.value.trim();
            const description = taskDescription.value.trim();

            if (title) {
                vscode.postMessage({
                    type: 'addTask',
                    task: {
                        title: title,
                        description: description
                    }
                });

                // Clear form
                taskTitle.value = '';
                taskDescription.value = '';
                taskTitle.focus();
            }
        });

        // Enter key to add task
        taskTitle.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addButton.click();
            }
        });

        // Delete task
        tasksContainer.addEventListener('click', (e) => {
            if (e.target.closest('.delete-btn')) {
                const taskItem = e.target.closest('.task-item');
                const taskId = taskItem.dataset.taskId;
                
                vscode.postMessage({
                    type: 'deleteTask',
                    id: taskId
                });
            }
        });

        // Enable/disable add button based on input
        taskTitle.addEventListener('input', () => {
            addButton.disabled = !taskTitle.value.trim();
        });

        // Focus on title input when loaded
        taskTitle.focus();
        
        // Initialize button state
        addButton.disabled = true;
    </script>
</body>
</html>`;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

function activate(context) {
    // Register the webview view provider
    const provider = new TaskTrackerProvider(context);
    
    const disposable = vscode.window.registerWebviewViewProvider(
        'vsc-task',
        provider
    );

    // Register command to show the view
    let showViewDisposable = vscode.commands.registerCommand('vsc-task.showView', () => {
        vscode.commands.executeCommand('workbench.view.extension.vsc-task');
    });

    context.subscriptions.push(disposable, showViewDisposable);
    
    console.log('VSTask extension is now active');
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};