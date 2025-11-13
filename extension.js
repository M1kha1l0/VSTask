const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class TaskTrackerProvider {
    constructor(context) {
        this.context = context;
        this._onDidChange = new vscode.EventEmitter();
        this.tasks = this.context.globalState.get('vsc-tasks', []);
        this.refreshTasks(); // Используем единый метод для обновления состояния
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
                case 'editTask':
                    this.editTask(data.id, data.task);
                    break;
                case 'refreshTasks':
                    this.refreshTasks();
                    break;
            }
        });
    }

    // Единый метод для обновления состояния задач
    refreshTasks() {
        this.updateAllTaskPriorities();
        this.sortTasks();
        this.saveTasks();
        this.updateView();
    }

    addTask(taskData) {
        const task = {
            id: Date.now().toString(),
            title: taskData.title,
            description: taskData.description,
            deadline: taskData.deadline || null,
            priority: taskData.priority || 1,
            originalPriority: taskData.priority || 1,
            createdAt: new Date().toISOString()
        };
        
        this.tasks.push(task);
        this.refreshTasks();
    }

    deleteTask(id) {
        const taskToDelete = this.tasks.find(task => task.id === id);
        this.tasks = this.tasks.filter(task => task.id !== id);
        this.refreshTasks();
        
        if (taskToDelete) {
            vscode.window.showInformationMessage(`Task "${taskToDelete.title}" deleted`);
        }
    }

    editTask(id, taskData) {
        const taskIndex = this.tasks.findIndex(task => task.id === id);
        if (taskIndex !== -1) {
            this.tasks[taskIndex].title = taskData.title;
            this.tasks[taskIndex].description = taskData.description;
            this.tasks[taskIndex].deadline = taskData.deadline || null;
            this.tasks[taskIndex].priority = taskData.priority || 1;
            this.tasks[taskIndex].originalPriority = taskData.priority || 1;
            
            this.refreshTasks();
        }
    }

    // Обновляем приоритеты всех задач с учетом текущего времени
    updateAllTaskPriorities() {
        const now = new Date();
        this.tasks.forEach(task => {
            const deadlineDate = task.deadline ? new Date(task.deadline) : null;
            const isOverdue = deadlineDate && deadlineDate < now;
            
            if (isOverdue) {
                task.priority = 10; // Максимальный приоритет для просроченных задач
            } else {
                task.priority = task.originalPriority; // Возвращаем исходный приоритет
            }
        });
    }

    // Быстрая сортировка по убыванию приоритета
    sortTasks() {
        if (this.tasks.length <= 1) return;
        
        this.quickSort(this.tasks, 0, this.tasks.length - 1);
    }

    quickSort(arr, low, high) {
        if (low < high) {
            const pi = this.partition(arr, low, high);
            this.quickSort(arr, low, pi - 1);
            this.quickSort(arr, pi + 1, high);
        }
    }

    partition(arr, low, high) {
        const pivot = arr[high].priority;
        let i = low - 1;
        
        for (let j = low; j < high; j++) {
            if (arr[j].priority >= pivot) { // Сортировка по убыванию
                i++;
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        }
        [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
        return i + 1;
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
        const now = new Date();
        
        // Generate tasks HTML
        const tasksHtml = this.tasks.map(task => {
            const deadlineDate = task.deadline ? new Date(task.deadline) : null;
            const isOverdue = deadlineDate && deadlineDate < now;
            const hasDeadline = deadlineDate && !isOverdue;
            
            // Определяем классы для задачи
            let taskClass = 'task-item';
            if (isOverdue) {
                taskClass += ' overdue';
            } else if (hasDeadline) {
                taskClass += ' has-deadline';
            }
            
            let deadlineHtml = '';
            if (task.deadline) {
                const deadlineClass = isOverdue ? 'task-deadline overdue' : 
                                    hasDeadline ? 'task-deadline has-deadline' : 'task-deadline';
                const formattedDate = deadlineDate.toLocaleDateString() + ' ' + deadlineDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                deadlineHtml = `
                    <div class="${deadlineClass}" data-deadline="${task.deadline}">
                        <svg class="deadline-icon" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13A6 6 0 1 1 8 2a6 6 0 0 1 0 12z"/>
                            <path d="M8 3.5v5l3 1.5"/>
                        </svg>
                        Due: ${formattedDate}
                        ${isOverdue ? ' (Overdue)' : ''}
                    </div>
                `;
            }

            // Отображаем текущий приоритет (может быть 10 для просроченных)
            const displayPriority = task.priority;

            return `
                <div class="${taskClass}" data-task-id="${task.id}" data-task-priority="${displayPriority}">
                    <div class="task-content">
                        <div class="task-title">${this.escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                        <div class="task-priority-display">
                            Priority: ${displayPriority}
                        </div>
                        ${deadlineHtml}
                    </div>
                    <div class="task-actions">
                        <button class="edit-btn" title="Edit task">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.251c.081-.286.235-.547.445-.757l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286Z"/>
                            </svg>
                        </button>
                        <button class="delete-btn" title="Delete task">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M11 3h4v1h-1v11c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V4H1V3h4V1c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2zM6 2h4v1H6V2zm-2 2v10h8V4H4zm3 2h1v6H7V6zm2 0h1v6H9V6z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const tasksContent = this.tasks.length > 0 ? tasksHtml : '<div class="empty-state">No tasks yet. Add your first task above!</div>';

        // Read HTML template from file
        const templatePath = path.join(this.context.extensionPath, 'media', 'taskView.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        
        // Get CSS URI
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'taskView.css')
        );
        
        // Replace placeholders with actual content
        html = html.replace('{{TASKS_CONTENT}}', tasksContent);
        html = html.replace('{{CSS_URI}}', cssUri);
        
        return html;
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
