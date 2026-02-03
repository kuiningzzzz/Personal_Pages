<template>
    <footer class="footer-container">
        <div class="footer-content">
            <!-- 版权信息 -->
            <div class="copyright">
                <p>&copy; {{ currentYear }} 奎宁zzzz. All rights reserved.</p>
            </div>

            <!-- 备案信息 -->
            <div class="beian-info">
                <!-- ICP备案号 - 需要链接到工信部网站 -->
                <a 
                    href="https://beian.miit.gov.cn/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    class="beian-link"
                >
                    鲁ICP备2025203944号-1
                </a>
            </div>

            <!-- 其他信息（可选） -->
            <div class="extra-info">
                <span>Powered by Vue.js</span>
            </div>
        </div>
    </footer>
</template>

<script setup>
import { ref, computed } from 'vue'

// 获取当前年份
const currentYear = computed(() => new Date().getFullYear())
</script>

<style scoped>
.footer-container {
    margin-top: 60px;
    padding: 32px 24px;
    border-radius: 12px;
    backdrop-filter: blur(16px);
    background: rgba(15, 20, 25, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: #d1d9e6;
}

.footer-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

/* 版权信息 */
.copyright {
    text-align: center;
}

.copyright p {
    margin: 0;
    font-size: 14px;
    color: #a8b3c1;
}

/* 备案信息 */
.beian-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
}

.beian-link {
    color: #8a9bb0;
    text-decoration: none;
    font-size: 13px;
    transition: all 0.25s ease;
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.beian-link:hover {
    color: #b8c5d6;
    background: rgba(255, 255, 255, 0.05);
}

/* 其他信息 */
.extra-info {
    font-size: 12px;
    color: #7a8a9c;
    margin-top: 8px;
}

/* 平板和手机响应式 */
@media (max-width: 768px) {
    .footer-container {
        margin-top: 40px;
        padding: 24px 16px;
    }

    .beian-info {
        gap: 12px;
    }

    .beian-link {
        font-size: 12px;
    }

    .copyright p {
        font-size: 13px;
    }
}

@media (max-width: 480px) {
    .footer-container {
        margin-top: 30px;
        padding: 20px 12px;
    }

    .footer-content {
        gap: 12px;
    }

    .copyright p {
        font-size: 12px;
    }

    .beian-link {
        font-size: 11px;
        line-height: 1.6;
    }

    .extra-info {
        font-size: 11px;
    }
}
</style>