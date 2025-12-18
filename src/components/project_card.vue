<template>
    <div class="project-card">
        <div class="card-header">
            <h3 class="card-title">{{ title }}</h3>
            <span class="card-date" v-if="date">{{ date }}</span>
        </div>
        <div class="card-content">
            <p class="card-desc">{{ desc }}</p>
        </div>
        <div class="card-footer">
            <router-link v-if="link" :to="link" class="action-link">
                <button class="action-btn read-more-btn">
                    <span>Read More</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </button>
            </router-link>
            
            <button v-if="downloadUrl" @click="handleDownload" class="action-btn download-btn">
                <span>Download</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </button>

            <a v-if="repoUrl" :href="repoUrl" target="_blank" rel="noopener noreferrer" class="action-link">
                <button class="action-btn repo-btn">
                    <span>Website</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                    </svg>
                </button>
            </a>
        </div>
    </div>
</template>

<script setup>
const props = defineProps({
    title: {
        type: String,
        required: true
    },
    desc: {
        type: String,
        required: true
    },
    date: {
        type: String,
        default: ''
    },
    link: {
        type: String,
        default: ''
    },
    downloadUrl: {
        type: String,
        default: ''
    },
    repoUrl: {
        type: String,
        default: ''
    }
})

const handleDownload = () => {
    if (props.downloadUrl) {
        // 创建一个临时的a标签来触发下载
        const link = document.createElement('a')
        link.href = props.downloadUrl
        link.download = props.downloadUrl.split('/').pop() || 'download'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }
}
</script>

<style scoped>
.project-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    padding: 24px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: fit-content;
}

.project-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    border-color: rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
}

.card-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.card-title {
    color: #ffffff;
    font-size: 20px;
    font-weight: 500;
    margin: 0;
    line-height: 1.4;
    letter-spacing: 0.3px;
    word-break: break-word;
}

.card-date {
    color: #7a8a9e;
    font-size: 12px;
    font-weight: 300;
}

.card-content {
    flex: 1;
}

.card-desc {
    color: #b8c5d6;
    font-size: 14px;
    line-height: 1.7;
    font-weight: 300;
    margin: 0;
    word-break: break-word;
}

.card-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    flex-wrap: wrap;
}

.action-link {
    text-decoration: none;
}

.action-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    color: #e8edf5;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}

.action-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
}

.read-more-btn:hover {
    transform: translateX(2px);
}

.read-more-btn:hover svg {
    transform: translateX(2px);
}

.download-btn {
    background: rgba(116, 170, 255, 0.1);
    border-color: rgba(116, 170, 255, 0.3);
    color: #74aaff;
}

.download-btn:hover {
    background: rgba(116, 170, 255, 0.2);
    border-color: rgba(116, 170, 255, 0.5);
    color: #9cc3ff;
}

.repo-btn {
    background: rgba(100, 200, 100, 0.1);
    border-color: rgba(100, 200, 100, 0.3);
    color: #70dd70;
}

.repo-btn:hover {
    background: rgba(100, 200, 100, 0.2);
    border-color: rgba(100, 200, 100, 0.5);
    color: #90ff90;
}

.action-btn svg {
    transition: transform 0.2s ease;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .project-card {
        padding: 16px;
        gap: 12px;
    }

    .card-title {
        font-size: 16px;
    }

    .card-desc {
        font-size: 13px;
    }

    .card-footer {
        gap: 6px;
    }

    .action-btn {
        padding: 6px 12px;
        font-size: 12px;
    }
}

@media (max-width: 480px) {
    .project-card {
        padding: 12px;
        gap: 10px;
    }

    .card-title {
        font-size: 14px;
    }

    .card-date {
        font-size: 11px;
    }

    .card-desc {
        font-size: 12px;
        line-height: 1.6;
    }

    .card-footer {
        gap: 4px;
        justify-content: flex-start;
    }

    .action-btn {
        padding: 5px 10px;
        font-size: 11px;
        gap: 4px;
    }

    .action-btn svg {
        width: 14px;
        height: 14px;
    }
}
</style>
