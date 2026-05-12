// ====== 0. 全局配置 ======
const DEFAULT_ICON = 'fas fa-globe'; // 默认图标，修改这里即可全局生效

let isDragMode = false; // 拖拽模式标志
let draggedElement = null; // 当前拖拽的元素
let isLoggedIn = false; // 登录状态标志（由后端验证）
let currentUsername = ''; // 当前登录用户名（由后端返回）
let wallpaperModal = null; // 壁纸选择弹窗（延迟初始化）

// ====== 0. 工具函数 ======
// 图标缓存配置
const ICON_CACHE_PREFIX = 'icon_cache_';
const ICON_CACHE_EXPIRE = 7 * 24 * 60 * 60 * 1000; // 7天过期

// 从缓存获取图标URL
function getCachedIconUrl(hostname) {
    try {
        const cacheKey = ICON_CACHE_PREFIX + hostname;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { url, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < ICON_CACHE_EXPIRE) {
                return url;
            }
        }
    } catch (e) {
        // 忽略解析错误
    }
    return null;
}

// 保存图标URL到缓存
function saveIconCache(hostname, url) {
    try {
        const cacheKey = ICON_CACHE_PREFIX + hostname;
        localStorage.setItem(cacheKey, JSON.stringify({
            url: url,
            timestamp: Date.now()
        }));
    } catch (e) {
        // 存储空间不足时清理旧缓存
        clearOldIconCache();
        try {
            const cacheKey = ICON_CACHE_PREFIX + hostname;
            localStorage.setItem(cacheKey, JSON.stringify({
                url: url,
                timestamp: Date.now()
            }));
        } catch (e2) {
            // 仍失败则放弃
        }
    }
}

// 清理过期缓存（当存储空间不足时）
function clearOldIconCache() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(ICON_CACHE_PREFIX)) {
            try {
                const cached = localStorage.getItem(key);
                const { timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp >= ICON_CACHE_EXPIRE) {
                    keysToRemove.push(key);
                }
            } catch (e) {
                keysToRemove.push(key);
            }
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

// 动态获取 favicon URL
function getAutoFavicon(url) {
    if (!url || url === '#') return null;
    try {
        const urlObj = new URL(url);
        const isLocal = urlObj.hostname === 'localhost' || 
                       urlObj.hostname === '127.0.0.1' || 
                       urlObj.hostname.startsWith('192.168.') || 
                       urlObj.hostname.startsWith('10.') || 
                       urlObj.hostname.endsWith('.local');
        
        if (isLocal) {
            return urlObj.origin + '/favicon.ico';
        }
        
        // 尝试从缓存获取
        const cachedUrl = getCachedIconUrl(urlObj.hostname);
        if (cachedUrl) {
            return cachedUrl;
        }
        
        // 生成新URL并缓存
        const faviconApi = appConfig.faviconApi || DEFAULT_CONFIG.faviconApi;
        const newUrl = faviconApi.replace('{link}', urlObj.hostname);
        saveIconCache(urlObj.hostname, newUrl);
        return newUrl;
    } catch (e) {
        return null;
    }
}

function renderIcon(iconValue, defaultIcon = DEFAULT_ICON) {
    if (!iconValue) {
        return `<img src="${defaultIcon}" alt="">`;
    }
    
    // 规范化图标URL
    iconValue = normalizeIconUrl(iconValue);
    
    // Font Awesome 图标类
    if (iconValue.startsWith('fas ') || iconValue.startsWith('fab ') || iconValue.startsWith('far ')) {
        return `<i class="${iconValue}"></i>`;
    }
    
    // 图片文件（URL 或相对路径）
    const imageExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.ico', '.gif', '.webp', '.bmp'];
    const isImageUrl = iconValue.startsWith('http') && (iconValue.includes('.') || iconValue.includes('/favicon'));
    const isImageFile = imageExtensions.some(ext => iconValue.toLowerCase().endsWith(ext));
    
    if (isImageUrl || isImageFile) {
        return `<img src="${iconValue}" alt="" onerror="this.onerror=null; this.src='${defaultIcon}'">`;
    }
    
    // 作为 emoji 或其他字符串显示
    return iconValue;
}

// ====== 1. 默认配置与全局菜单配置 ======
const DEFAULT_CONFIG = {
    wallpaper: '/wallpaper/001.jpg',
    blur: 10, bgBlur: 0, cardBorderOpacity: 0, searchBorderOpacity: 0, showSearch: true, showTitle: true, searchTitle: '我的导航', showGroupDivider: true, showAuthorButton: true,
    siteTitle: '个人导航', siteIcon: '', 
    faviconApi: 'https://www.google.com/s2/favicons?domain={link}&sz=64',
    searchEngine: 'google',
    searchEngines: {
        google: {
            name: 'Google',
            icon: 'https://www.google.com/favicon.ico',
            searchUrl: 'https://www.google.com/search?q='
        },
        bing: {
            name: 'Bing',
            icon: 'https://www.bing.com/favicon.ico',
            searchUrl: 'https://www.bing.com/search?q='
        },
        baidu: {
            name: '百度',
            icon: 'https://www.baidu.com/favicon.ico',
            searchUrl: 'https://www.baidu.com/s?wd='
        }
    },
    groups: [
        {
            id: 'g-1', title: '日常使用', icon: 'fas fa-folder',
            links: [
                { id: 'l-1', title: 'GitHub', desc: '代码托管平台', url: 'https://github.com', icon: 'fas fa-globe' },
                { id: 'l-2', title: 'Google', desc: '搜索引擎', url: 'https://google.com', icon: 'fas fa-search' }
            ]
        }
    ]
};

let appConfig = JSON.parse(localStorage.getItem('nav_config')) || DEFAULT_CONFIG;
// 确保新增字段存在
if (!appConfig.contextMenu) appConfig.contextMenu = [];
if (appConfig.cardBorderOpacity === undefined) appConfig.cardBorderOpacity = 50;
let targetObject = null; // 存储当前右键点击的对象信息
let currentEditingGroupId = null;
let currentEditingCardId = null;

// DOM 元素获取
const container = document.getElementById('groups-container');
const settingsPanel = document.getElementById('settings-panel');
const cardModal = document.getElementById('card-modal');
const groupModal = document.getElementById('group-modal');
const deleteCardModal = document.getElementById('delete-confirm-modal');
const deleteGroupModal = document.getElementById('group-delete-modal');

// ====== 2. 核心渲染与配置保存 ======
let wallpaperFadeTimer = null;

function saveConfig() {
    // 保存到 localStorage 作为缓存
    localStorage.setItem('nav_config', JSON.stringify(appConfig));
    
    // 尝试保存到后端
    saveConfigToServer(appConfig);
    
    applyAppearance();
}

function applyAppearance() {
    const root = document.documentElement;
    const bg = document.getElementById('app-background');
    const bgFade = document.getElementById('app-background-fade');
    
    // 清除之前的定时器
    if (wallpaperFadeTimer) {
        clearTimeout(wallpaperFadeTimer);
        wallpaperFadeTimer = null;
    }
    
    // 设置fade层的背景图片并淡入
    const newBgUrl = `url('${appConfig.wallpaper}')`;
    bgFade.style.backgroundImage = newBgUrl;
    // 强制重排
    bgFade.offsetHeight;
    bgFade.style.opacity = '1';
    
    // 200ms后切换底层背景并淡出fade层
    wallpaperFadeTimer = setTimeout(() => {
        bg.style.backgroundImage = newBgUrl;
        bgFade.style.opacity = '0';
        wallpaperFadeTimer = null;
    }, 200);
    
    root.style.setProperty('--blur-amount', `${appConfig.blur}px`);
    root.style.setProperty('--bg-blur', `${appConfig.bgBlur}px`);
    root.style.setProperty('--card-border-opacity', `${appConfig.cardBorderOpacity / 100}`);
    root.style.setProperty('--search-border-opacity', (appConfig.searchBorderOpacity || 0) / 100);
    document.getElementById('blur-value-display').innerText = `${appConfig.blur}px`;
    document.getElementById('bg-blur-display').innerText = `${appConfig.bgBlur}px`;
    document.getElementById('card-border-display').innerText = `${appConfig.cardBorderOpacity}%`;
    document.getElementById('search-border-display').innerText = `${appConfig.searchBorderOpacity || 0}%`;
    document.getElementById('main-title').innerText = appConfig.searchTitle;
    document.getElementById('main-title').style.display = appConfig.showTitle ? 'block' : 'none';
    if (appConfig.showSearch) {
        document.querySelector('.search-box').style.display = 'flex';
        if (appConfig.showTitle) {
            document.getElementById('main-title').style.marginBottom = '';
        }
    } else {
        document.querySelector('.search-box').style.display = 'none';
        if (appConfig.showTitle) {
            document.getElementById('main-title').style.marginBottom = '0';
        }
    }
    // 分组分割线显示控制
    document.getElementById('toggle-group-divider').checked = appConfig.showGroupDivider !== false;
    root.style.setProperty('--group-divider-display', appConfig.showGroupDivider ? '1px solid rgba(255, 255, 255, 0.15)' : 'none');
    
    // 更新网站标题
    document.title = appConfig.siteTitle || '个人导航';
    
    // 更新网站图标
    updateFavicon(appConfig.siteIcon);
    
    // 作者按钮显示控制
    const authorBtn = document.getElementById('btn-author');
    if (authorBtn) {
        authorBtn.style.display = appConfig.showAuthorButton !== false ? 'flex' : 'none';
    }
}

function renderGroups() {
    container.innerHTML = '';
    appConfig.groups.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'group';
        groupEl.innerHTML = `
            <div class="group-header" data-id="${group.id}">
                <span class="group-icon">${renderIcon(group.icon, 'fas fa-bookmark')}</span>
                <span class="group-title">${group.title}</span>
            </div>
            <div class="cards-grid"></div>
        `;

        // 分组标题右键拦截（仅登录后显示编辑菜单）
        const header = groupEl.querySelector('.group-header');
        header.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            hideAllMenus();
            if (isLoggedIn) {
                targetObject = { groupId: group.id, type: 'group' };
                showMenu(document.getElementById('group-context-menu'), e.pageX, e.pageY);
            } else {
                renderGlobalMenu();
                showMenu(document.getElementById('global-context-menu'), e.pageX, e.pageY);
            }
        };

        const grid = groupEl.querySelector('.cards-grid');
        group.links.forEach(link => {
            const card = document.createElement('a');
            card.className = 'nav-card glass-panel';
            card.href = link.url; card.target = '_blank';
            card.dataset.id = link.id; // 添加data-id属性
            if (isDragMode) card.classList.add('draggable');
            
            // 图标处理：autoFetchIcon=true 则自动获取，否则 icon 有内容用自定义，为空自动获取
            const isAutoIcon = link.autoFetchIcon === true || !link.icon;
            const iconValue = isAutoIcon ? (getAutoFavicon(link.url) || 'fas fa-bookmark') : link.icon;
            const iconHtml = `<div class="card-icon-inner">${renderIcon(iconValue, 'fas fa-bookmark')}</div>`;
            
            card.innerHTML = `<div class="card-icon">${iconHtml}</div><div class="card-info"><div class="card-title">${link.title}</div>${link.desc ? '<div class="card-desc">' + link.desc + '</div>' : ''}</div>`;
            
            // 卡片右键拦截（仅登录后显示编辑菜单）
            card.oncontextmenu = (e) => {
                e.preventDefault(); e.stopPropagation();
                hideAllMenus();
                if (isLoggedIn) {
                    targetObject = { id: link.id, groupId: group.id, type: 'card' };
                    showMenu(document.getElementById('context-menu'), e.pageX, e.pageY);
                } else {
                    renderGlobalMenu();
                    showMenu(document.getElementById('global-context-menu'), e.pageX, e.pageY);
                }
            };
            grid.appendChild(card);
        });
        container.appendChild(groupEl);
    });
    
    // 如果处于拖拽模式，重新绑定拖拽事件
    if (isDragMode) {
        enableDragMode();
    }

}

// ====== 3. 弹窗与逻辑处理 ======

// 卡片弹窗
function openCardModal(groupId, cardId = null) {
    hideAllMenus(); // 弹出弹窗时清理右键菜单
    currentEditingGroupId = groupId; currentEditingCardId = cardId;
    const isEdit = !!cardId;
    document.getElementById('modal-title').innerText = isEdit ? '编辑快捷方式' : '添加快捷方式';
    
    // 图标自动获取逻辑
    const autoCheckbox = document.getElementById('modal-icon-auto');
    const iconInput = document.getElementById('modal-icon');
    const iconWrapper = document.getElementById('modal-icon-wrapper');
    const iconPreview = document.getElementById('card-icon-preview');
    
    if (isEdit) {
        const link = appConfig.groups.find(g => g.id === groupId).links.find(l => l.id === cardId);
        // autoFetchIcon=true 则自动获取，否则 icon 有内容用自定义，为空自动获取
        const isAutoIcon = link.autoFetchIcon === true || !link.icon;
        autoCheckbox.checked = isAutoIcon;
        iconWrapper.style.display = isAutoIcon ? 'none' : 'flex';
        // 如果自定义图标，显示图标链接/路径
        iconInput.value = isAutoIcon ? '' : (link.icon || '');
        // 更新图标预览
        updateCardIconPreview(link.icon);
        document.getElementById('modal-card-title').value = link.title;
        document.getElementById('modal-desc').value = link.desc;
        document.getElementById('modal-url').value = link.url;
    } else {
        autoCheckbox.checked = true;
        iconWrapper.style.display = 'none';
        iconInput.value = '';
        // 清空图标预览
        iconPreview.innerHTML = '';
        document.getElementById('modal-card-title').value = '';
        document.getElementById('modal-desc').value = '';
        document.getElementById('modal-url').value = '';
    }
    
    // 复选框切换逻辑
    autoCheckbox.onchange = () => {
        iconWrapper.style.display = autoCheckbox.checked ? 'none' : 'flex';
        if (!autoCheckbox.checked) {
            updateCardIconPreview(iconInput.value);
        }
    };
    
    // 输入框变化时更新预览
    iconInput.oninput = () => {
        updateCardIconPreview(iconInput.value);
    };
    
    cardModal.classList.add('show');
}

document.getElementById('modal-btn-save').onclick = () => {
    const group = appConfig.groups.find(g => g.id === currentEditingGroupId);
    const isAutoIcon = document.getElementById('modal-icon-auto').checked;
    const url = document.getElementById('modal-url').value || '#';
    let icon = DEFAULT_ICON;
    
    if (!isAutoIcon) {
        // 非自动获取：使用自定义图标
        icon = normalizeIconUrl(document.getElementById('modal-icon').value || DEFAULT_ICON);
    }
    // 自动获取时 icon 为空，渲染时动态生成
    
    const data = {
        autoFetchIcon: isAutoIcon,
        icon: icon,
        title: document.getElementById('modal-card-title').value || '未命名',
        desc: document.getElementById('modal-desc').value,
        url: url
    };
    if (currentEditingCardId) {
        const idx = group.links.findIndex(l => l.id === currentEditingCardId);
        group.links[idx] = { ...group.links[idx], ...data };
    } else {
        group.links.push({ id: 'l-' + Date.now(), ...data });
    }
    saveConfig(); renderGroups(); cardModal.classList.remove('show');
};

// 分组弹窗
function openGroupModal(groupId = null) {
    hideAllMenus(); // 弹出弹窗时清理右键菜单
    currentEditingGroupId = groupId;
    const isEdit = !!groupId;
    document.getElementById('group-modal-title').innerText = isEdit ? '编辑分组' : '添加新分组';
    if (isEdit) {
        const group = appConfig.groups.find(g => g.id === groupId);
        document.getElementById('group-modal-icon').value = group.icon || 'fas fa-folder';
        document.getElementById('group-modal-name').value = group.title;
    } else {
        document.getElementById('group-modal-icon').value = 'fas fa-folder';
        document.getElementById('group-modal-name').value = '';
    }
    groupModal.classList.add('show');
    
    // 分组图标输入框始终显示
    document.getElementById('group-icon-wrapper').style.display = 'flex';
    
    // 初始化图标选择器
    initIconPicker('group-modal-icon', 'icon-preview', 'icon-picker-panel');
}

document.getElementById('group-modal-save').onclick = () => {
    const icon = normalizeIconUrl(document.getElementById('group-modal-icon').value || 'fas fa-folder');
    const title = document.getElementById('group-modal-name').value || '新分组';
    if (currentEditingGroupId) {
        const group = appConfig.groups.find(g => g.id === currentEditingGroupId);
        group.icon = icon; group.title = title;
    } else {
        appConfig.groups.push({ id: 'g-' + Date.now(), title, icon, links: [] });
    }
    saveConfig(); renderGroups(); groupModal.classList.remove('show');
};

// 安全删除逻辑
document.getElementById('confirm-card-delete-btn').onclick = () => {
    const group = appConfig.groups.find(g => g.id === targetObject.groupId);
    group.links = group.links.filter(l => l.id !== targetObject.id);
    saveConfig(); renderGroups(); deleteCardModal.classList.remove('show');
};

function openGroupDeleteConfirm() {
    hideAllMenus(); // 弹出弹窗时清理右键菜单
    const group = appConfig.groups.find(g => g.id === targetObject.groupId);
    document.getElementById('delete-target-name-display').innerText = group.title;
    const input = document.getElementById('group-delete-verify-input');
    const btn = document.getElementById('group-delete-confirm-btn');
    input.value = ''; btn.disabled = true;
    input.oninput = () => btn.disabled = (input.value !== group.title);
    deleteGroupModal.classList.add('show');
}

document.getElementById('group-delete-confirm-btn').onclick = () => {
    appConfig.groups = appConfig.groups.filter(g => g.id !== targetObject.groupId);
    saveConfig(); renderGroups(); deleteGroupModal.classList.remove('show');
};

// ====== 4. 右键菜单逻辑 ======
function showMenu(menu, x, y) {
    // 先隐藏所有菜单
    hideAllMenus();
    
    // 强制重置动画，确保每次显示都重新触发
    menu.style.animation = 'none';
    menu.offsetHeight; // 触发重排，强制浏览器重新计算样式
    menu.style.animation = '';
    
    menu.style.left = `${x}px`; menu.style.top = `${y}px`;
    menu.classList.add('show');
}

function hideAllMenus() {
    document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('show'));
}

function renderGlobalMenu() {
    const wrapper = document.getElementById('global-menu-items');
    wrapper.innerHTML = '';
    
    // 1. 固定项：添加分组（仅登录后显示）
    if (isLoggedIn) {
        const addGroupItem = document.createElement('div');
        addGroupItem.className = 'menu-item menu-item-adjust';
        addGroupItem.innerHTML = `<i class="fas fa-plus"></i><span>添加分组</span>`;
        addGroupItem.onclick = () => openGroupModal();
        wrapper.appendChild(addGroupItem);
    }

    // 2. 渲染配置的快捷方式（从 config.json 读取，在添加分组下面）
    const contextMenuItems = appConfig.contextMenu || [];
    if (contextMenuItems.length > 0) {
        // 登录后添加分组下面显示分割线
        if (isLoggedIn) {
            const divider1 = document.createElement('div'); divider1.className = 'menu-divider';
            wrapper.appendChild(divider1);
        }

        contextMenuItems.forEach(item => {
            if (item.type === 'divider') {
                const div = document.createElement('div'); div.className = 'menu-divider';
                wrapper.appendChild(div); return;
            }
            const div = document.createElement('div');
            div.className = 'menu-item';
            
            // 根据图标类型渲染（如果未配置图标则使用默认图标）
            let iconHtml = '';
            const icon = item.icon || '/pic/web.ico';
            if (icon.startsWith('http') || icon.endsWith('.png') || icon.endsWith('.jpg') || icon.endsWith('.ico') || icon.endsWith('.svg')) {
                iconHtml = `<img src="${icon}" style="width:16px; height:16px;">`;
            } else if (icon.startsWith('fas ') || icon.startsWith('fab ') || icon.startsWith('far ')) {
                iconHtml = `<i class="${icon}"></i>`;
            } else {
                iconHtml = `<span>${icon}</span>`;
            }
            
            div.innerHTML = `${iconHtml}<span>${item.title}</span>`;
            div.onclick = () => {
                if (item.url) window.open(item.url, '_blank');
            };
            wrapper.appendChild(div);
        });
    }

    // 3. 分割线（在快捷方式和底部固定项之间）
    const divider2 = document.createElement('div'); divider2.className = 'menu-divider';
    wrapper.appendChild(divider2);

    // 4. 固定项：刷新和全屏（始终在底部）
    const reloadItem = document.createElement('div');
    reloadItem.className = 'menu-item menu-item-adjust';
    reloadItem.innerHTML = `<i class="fas fa-redo"></i><span>刷新</span>`;
    reloadItem.onclick = () => location.reload();
    wrapper.appendChild(reloadItem);

    const fullscreenItem = document.createElement('div');
    fullscreenItem.className = 'menu-item menu-item-adjust';
    fullscreenItem.innerHTML = `<i class="fas fa-expand"></i><span>全屏</span>`;
    fullscreenItem.onclick = () => {
        !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen();
    };
    wrapper.appendChild(fullscreenItem);
}

// 全局屏蔽浏览器右键菜单（输入框除外，允许使用浏览器默认右键菜单）
document.oncontextmenu = (e) => {
    // 如果点击的是输入框或文本框，允许浏览器默认右键菜单
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return; // 不阻止默认行为，使用浏览器自带右键菜单
    }
    
    e.preventDefault();
    
    // 如果有任何弹窗显示，不显示自定义右键菜单
    const hasModal = document.querySelectorAll('.modal-overlay.show').length > 0;
    if (hasModal) return;
    
    // 设置面板点击不显示全局菜单
    if (e.target.closest('.settings-panel')) return;
    
    // 未登录时，点击卡片或分组标题也显示全局菜单
    if (!isLoggedIn && (e.target.closest('.nav-card') || e.target.closest('.group-header'))) {
        hideAllMenus(); renderGlobalMenu();
        showMenu(document.getElementById('global-context-menu'), e.pageX, e.pageY);
        return;
    }
    
    // 已登录时，点击卡片或分组标题会由各自的右键事件处理
    if (e.target.closest('.nav-card') || e.target.closest('.group-header')) return;
    
    hideAllMenus(); renderGlobalMenu();
    showMenu(document.getElementById('global-context-menu'), e.pageX, e.pageY);
};

document.getElementById('menu-edit-card').onclick = () => openCardModal(targetObject.groupId, targetObject.id);
document.getElementById('menu-delete-card').onclick = () => { hideAllMenus(); deleteCardModal.classList.add('show'); };
document.getElementById('group-menu-add-card').onclick = () => openCardModal(targetObject.groupId);
document.getElementById('group-menu-edit-action').onclick = () => openGroupModal(targetObject.groupId);
document.getElementById('group-menu-delete-action').onclick = () => openGroupDeleteConfirm();

// ====== 5. 设置面板与导入导出 ======
// 设置按钮点击
document.getElementById('btn-settings').onclick = (e) => {
    e.stopPropagation(); 
    hideAllMenus(); // 弹出设置面板时清理右键菜单
    settingsPanel.classList.toggle('show');
};

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    };
});

document.getElementById('btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(appConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `nav_config_${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
};

document.getElementById('btn-import-trigger').onclick = () => document.getElementById('input-import').click();
document.getElementById('input-import').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const config = JSON.parse(ev.target.result);
            if (config.groups) {
                appConfig = config;
                saveConfig();
                renderGroups();
                // 更新输入框的值
                document.getElementById('input-site-title').value = appConfig.siteTitle || '';
                document.getElementById('input-site-icon').value = appConfig.siteIcon || '';
                alert('导入成功！');
            }
        } catch (err) { alert('无效的JSON文件'); }
    };
    reader.readAsText(file);
};

// 各种监听
// 磨砂值调整：滑动时实时更新视觉效果
const rootElement = document.documentElement;

document.getElementById('slider-blur').oninput = (e) => {
    appConfig.blur = e.target.value;
    rootElement.style.setProperty('--blur-amount', `${appConfig.blur}px`);
    document.getElementById('blur-value-display').innerText = `${appConfig.blur}px`;
};

document.getElementById('slider-bg-blur').oninput = (e) => {
    appConfig.bgBlur = e.target.value;
    rootElement.style.setProperty('--bg-blur', `${appConfig.bgBlur}px`);
    document.getElementById('bg-blur-display').innerText = `${appConfig.bgBlur}px`;
};

document.getElementById('slider-card-border').oninput = (e) => {
    appConfig.cardBorderOpacity = e.target.value;
    rootElement.style.setProperty('--card-border-opacity', `${appConfig.cardBorderOpacity / 100}`);
    document.getElementById('card-border-display').innerText = `${appConfig.cardBorderOpacity}%`;
};

document.getElementById('slider-search-border').oninput = (e) => {
    appConfig.searchBorderOpacity = e.target.value;
    rootElement.style.setProperty('--search-border-opacity', appConfig.searchBorderOpacity / 100);
    document.getElementById('search-border-display').innerText = `${appConfig.searchBorderOpacity}%`;
};

// 外观页面保存按钮
document.getElementById('btn-save-appearance').onclick = () => {
    appConfig.wallpaper = document.getElementById('input-wallpaper').value;
    appConfig.blur = document.getElementById('slider-blur').value;
    appConfig.bgBlur = document.getElementById('slider-bg-blur').value;
    appConfig.cardBorderOpacity = document.getElementById('slider-card-border').value;
    appConfig.searchBorderOpacity = document.getElementById('slider-search-border').value;
    saveConfig();
    settingsPanel.classList.remove('show');
};

// 保存设置按钮
document.getElementById('btn-save-settings').onclick = () => {
    // 从输入框读取值并保存
    appConfig.wallpaper = document.getElementById('input-wallpaper').value;
    appConfig.blur = document.getElementById('slider-blur').value;
    appConfig.bgBlur = document.getElementById('slider-bg-blur').value;
    appConfig.cardBorderOpacity = document.getElementById('slider-card-border').value;
    appConfig.showTitle = document.getElementById('toggle-title').checked;
    appConfig.showSearch = document.getElementById('toggle-search').checked;
    appConfig.showGroupDivider = document.getElementById('toggle-group-divider').checked;
    appConfig.showAuthorButton = document.getElementById('toggle-author-btn').checked;
    appConfig.searchTitle = document.getElementById('input-title').value;
    appConfig.siteTitle = document.getElementById('input-site-title').value;
    appConfig.siteIcon = document.getElementById('input-site-icon').value;
    appConfig.faviconApi = document.getElementById('input-favicon-api').value;
    
    saveConfig();
    settingsPanel.classList.remove('show');
};

// ====== 右键菜单设置 ======
function renderContextMenuSettings() {
    const list = document.getElementById('contextmenu-list');
    list.innerHTML = '';
    const items = appConfig.contextMenu || [];
    items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'contextmenu-item';
        div.style.cssText = 'margin-bottom:10px; padding:10px; background:rgba(255,255,255,0.1); border-radius:6px;';
        
        if (item.type === 'divider') {
            div.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <span style="opacity:0.7; font-size:0.85rem;"><i class="fas fa-minus"></i> 分割线</span>
                    <button class="btn-danger btn-sm" data-idx="${idx}" style="padding:6px 10px; font-size:0.85rem; border-radius:6px; line-height:1.2;">删除</button>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <input type="text" placeholder="标题" value="${item.title || ''}" data-idx="${idx}" data-field="title" class="context-input" autocomplete="off">
                    <input type="text" placeholder="URL" value="${item.url || ''}" data-idx="${idx}" data-field="url" class="context-input" autocomplete="off">
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="text" placeholder="图标URL 或 Font Awesome 类" value="${item.icon || ''}" data-idx="${idx}" data-field="icon" class="context-input" style="flex:1;" autocomplete="off">
                        <button class="btn-danger btn-sm" data-idx="${idx}">删除</button>
                    </div>
                </div>
            `;
            // 输入事件
            div.querySelectorAll('input').forEach(input => {
                input.oninput = (e) => {
                    const i = parseInt(e.target.dataset.idx);
                    const field = e.target.dataset.field;
                    appConfig.contextMenu[i][field] = e.target.value;
                    saveConfig();
                };
            });
        }
        
        // 删除按钮事件
        div.querySelector('.btn-danger').onclick = (e) => {
            const i = parseInt(e.target.dataset.idx);
            appConfig.contextMenu.splice(i, 1);
            saveConfig();
            renderContextMenuSettings();
        };
        
        list.appendChild(div);
    });
}

// 添加快捷方式
document.getElementById('btn-add-contextmenu').onclick = () => {
    if (!appConfig.contextMenu) appConfig.contextMenu = [];
    appConfig.contextMenu.push({ title: '新快捷方式', url: 'https://', icon: '' });
    saveConfig();
    renderContextMenuSettings();
};

// 添加分割线
document.getElementById('btn-add-divider').onclick = () => {
    if (!appConfig.contextMenu) appConfig.contextMenu = [];
    appConfig.contextMenu.push({ type: 'divider' });
    saveConfig();
    renderContextMenuSettings();
};

// 切换标签页时刷新右键菜单设置
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.target === 'tab-contextmenu') {
            renderContextMenuSettings();
        }
    });
});

document.addEventListener('click', (e) => {
    hideAllMenus();
    // 壁纸弹窗：点击空白处关闭
    if (!e.target.closest('.wallpaper-wrapper')) document.getElementById('wallpaper-modal').classList.remove('show');
});

document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
});

// ====== 后端配置同步功能 ======
const API_BASE = ''; // 同源请求，无需指定域名
let eventSource = null;

// 从后端加载配置
async function loadConfigFromServer() {
    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            throw new Error('配置文件不存在');
        }
        
        const config = await response.json();
        return config;
    } catch (error) {
        console.log('从后端加载配置失败，将使用本地缓存:', error.message);
        return null;
    }
}

// 保存配置到后端（需要登录）
async function saveConfigToServer(config) {
    if (!isLoggedIn) {
        console.log('未登录，不保存到后端');
        return false;
    }
    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': currentUsername,
            },
            body: JSON.stringify(config),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '保存失败');
        }

        const result = await response.json();
        console.log('配置已保存到后端:', result.message);
        return true;
    } catch (error) {
        console.error('保存配置到后端失败:', error.message);
        return false;
    }
}

// 连接 SSE 接收实时更新
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource(`${API_BASE}/events`);

    eventSource.onmessage = function(event) {
        console.log('收到实时更新:', event.data);

        if (event.data === 'config_updated') {
            // 配置已更新，重新从后端加载
            loadConfigFromServer().then(config => {
                if (config && config.groups) {
                    console.log('检测到配置更新，正在刷新...');
                    appConfig = config;
                    applyAppearance();
                    renderGroups();
                    // 不显示更新提示
                }
            });
        }
    };

    eventSource.onerror = function(error) {
        console.error('SSE 连接错误:', error);
        // 5秒后重试
        setTimeout(connectSSE, 5000);
    };
}

// ====== 更新网站图标功能 ======
function updateFavicon(iconValue) {
    const faviconLink = document.getElementById('favicon-link');
    if (!iconValue) {
        faviconLink.href = './favicon.ico';
        return;
    }
    
    // 检查是否是 Font Awesome 图标类
    if (iconValue.startsWith('fas ') || iconValue.startsWith('fab ') || iconValue.startsWith('far ')) {
        // Font Awesome 图标不能直接用作 favicon，使用默认图标
        faviconLink.href = './favicon.ico';
        // 在页面标题旁显示 Font Awesome 图标
        displaySiteIcon(iconValue);
    } else {
        // URL 或路径，直接用作 favicon
        faviconLink.href = iconValue;
        // 移除页面标题旁的图标
        removeSiteIconDisplay();
    }
}

// 在页面标题旁显示 Font Awesome 图标
function displaySiteIcon(iconClass) {
    let iconEl = document.getElementById('site-icon-display');
    if (!iconEl) {
        iconEl = document.createElement('span');
        iconEl.id = 'site-icon-display';
        iconEl.style.marginRight = '10px';
        iconEl.style.fontSize = '1.2em';
        const titleEl = document.getElementById('main-title');
        titleEl.parentNode.insertBefore(iconEl, titleEl);
    }
    iconEl.innerHTML = `<i class="${iconClass}"></i>`;
}

// 移除页面标题旁的图标显示
function removeSiteIconDisplay() {
    const iconEl = document.getElementById('site-icon-display');
    if (iconEl) {
        iconEl.remove();
    }
}

// ====== 9. 搜索引擎切换功能 ======
// 搜索引擎数据从配置中读取
let currentSearchEngine = appConfig.searchEngine || 'google';

// 获取当前搜索引擎的配置
function getSearchEngineConfig() {
    return appConfig.searchEngines && appConfig.searchEngines[currentSearchEngine] 
        ? appConfig.searchEngines[currentSearchEngine] 
        : DEFAULT_CONFIG.searchEngines[currentSearchEngine];
}

// 搜索引擎图标点击 - 显示/隐藏选择器
document.getElementById('search-engine-icon').onclick = (e) => {
    e.stopPropagation();
    const selector = document.getElementById('search-engine-selector');
    selector.classList.toggle('show');
};

// 搜索引擎选项点击
document.querySelectorAll('.search-engine-option').forEach(option => {
    option.onclick = () => {
        const engine = option.dataset.engine;
        currentSearchEngine = engine;
        
        // 更新图标
        const iconImg = document.querySelector('#search-engine-icon img');
        const engineConfig = getSearchEngineConfig();
        if (engineConfig) {
            iconImg.src = engineConfig.icon;
            iconImg.alt = engineConfig.name;
        }
        
        // 保存到配置
        appConfig.searchEngine = engine;
        saveConfig();
        
        // 隐藏选择器
        document.getElementById('search-engine-selector').classList.remove('show');
    };
});

// 搜索功能 - 回车键触发
document.getElementById('search-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const query = this.value.trim();
        if (query) {
            const engineConfig = getSearchEngineConfig();
            const url = engineConfig.searchUrl + encodeURIComponent(query);
            window.open(url, '_blank');
        }
    }
});

// 点击空白处关闭搜索引擎选择器
document.addEventListener('click', (e) => {
    const selector = document.getElementById('search-engine-selector');
    if (selector.classList.contains('show') && 
        !e.target.closest('#search-engine-icon') && 
        !e.target.closest('#search-engine-selector')) {
        selector.classList.remove('show');
    }
});

// ====== 初始化配置加载 ======
async function initConfig() {
    // 优先从后端加载配置
    const serverConfig = await loadConfigFromServer();

    if (serverConfig && serverConfig.groups) {
        // 后端加载成功，使用后端配置
        console.log('从后端加载配置成功');
        appConfig = serverConfig;
    } else {
        // 后端加载失败，使用 localStorage 缓存
        console.log('使用本地缓存配置');
        const localConfig = localStorage.getItem('nav_config');
        if (localConfig) {
            try {
                appConfig = JSON.parse(localConfig);
            } catch (e) {
                console.error('本地配置解析失败，使用默认配置');
                appConfig = DEFAULT_CONFIG;
            }
        }
    }

    // 确保新增字段存在
    if (appConfig.cardBorderOpacity === undefined) appConfig.cardBorderOpacity = 0;
    if (appConfig.searchBorderOpacity === undefined) appConfig.searchBorderOpacity = 0;

    // 应用配置
    applyAppearance();
    renderGroups();

    // 更新设置面板的输入框值
    document.getElementById('input-wallpaper').value = appConfig.wallpaper;
    document.getElementById('slider-blur').value = appConfig.blur;
    document.getElementById('slider-bg-blur').value = appConfig.bgBlur;
    document.getElementById('slider-card-border').value = appConfig.cardBorderOpacity || 0;
    document.getElementById('slider-search-border').value = appConfig.searchBorderOpacity || 0;
    document.getElementById('toggle-title').checked = appConfig.showTitle !== false;
    document.getElementById('toggle-search').checked = appConfig.showSearch;
    document.getElementById('toggle-group-divider').checked = appConfig.showGroupDivider !== false;
    document.getElementById('toggle-author-btn').checked = appConfig.showAuthorButton !== false;
    document.getElementById('input-title').value = appConfig.searchTitle;
    document.getElementById('input-site-title').value = appConfig.siteTitle || '';
    document.getElementById('input-site-icon').value = appConfig.siteIcon || '';
    document.getElementById('input-favicon-api').value = appConfig.faviconApi || DEFAULT_CONFIG.faviconApi;

}

// 执行初始化
initConfig();

// ====== 登录功能 ======

// 更新登录状态 UI
function updateLoginUI() {
    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');
    const editModeBtn = document.getElementById('btn-edit-mode');
    const settingsBtn = document.getElementById('btn-settings');
    const wallpaperBtn = document.getElementById('btn-wallpaper');
    const authorBtn = document.getElementById('btn-author');

    if (isLoggedIn) {
        // 已登录状态
        loginBtn?.classList.add('hidden');
        logoutBtn?.classList.remove('hidden');
        editModeBtn?.classList.remove('hidden');
        settingsBtn?.classList.remove('hidden');
        wallpaperBtn?.classList.remove('hidden');
        authorBtn?.classList.add('logged-in');
        // 加载用户列表
        loadUserList();
    } else {
        // 未登录状态
        loginBtn?.classList.remove('hidden');
        logoutBtn?.classList.add('hidden');
        editModeBtn?.classList.add('hidden');
        settingsBtn?.classList.add('hidden');
        wallpaperBtn?.classList.add('hidden');
        authorBtn?.classList.remove('logged-in');
        // 关闭设置面板
        settingsPanel?.classList.remove('show');
        // 关闭壁纸选择弹窗
        wallpaperModal?.classList.remove('show');
    }
    // 确保 SSE 始终连接（未登录也需接收配置更新）
    connectSSE();
}

// 登录按钮点击
document.getElementById('btn-login').onclick = () => {
    document.getElementById('login-modal').classList.add('show');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('login-username').focus();
};

// 登录表单提交
document.getElementById('btn-login-submit').onclick = async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!username || !password) {
        errorEl.textContent = '请输入用户名和密码';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const result = await response.json();

        if (response.ok) {
            isLoggedIn = true;
            currentUsername = result.username;
            document.getElementById('login-modal').classList.remove('show');
            updateLoginUI();
            console.log('登录成功:', currentUsername);
        } else {
            errorEl.textContent = result.error || '登录失败';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = '网络错误，请重试';
        errorEl.style.display = 'block';
    }
};

// 登出按钮点击
document.getElementById('btn-logout').onclick = () => {
    isLoggedIn = false;
    currentUsername = '';
    // 通知后端登出
    fetch('/api/logout', { method: 'POST' }).catch(() => {});
    updateLoginUI();
    console.log('已登出');
};

// 修改密码
document.getElementById('btn-change-password').onclick = async () => {
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;

    if (!oldPassword || !newPassword) {
        alert('请填写完整信息');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': currentUsername,
            },
            body: JSON.stringify({ oldPassword, newPassword }),
        });

        const result = await response.json();

        if (response.ok) {
            alert('密码修改成功');
            document.getElementById('old-password').value = '';
            document.getElementById('new-password').value = '';
        } else {
            alert(result.error || '修改失败');
        }
    } catch (error) {
        alert('网络错误，请重试');
    }
};

// 加载用户列表
async function loadUserList() {
    if (!isLoggedIn) return;

    try {
        const response = await fetch(`${API_BASE}/api/users`, {
            method: 'GET',
            headers: {
                'X-Username': currentUsername,
            },
        });

        if (response.ok) {
            const result = await response.json();
            const userList = document.getElementById('user-list');
            userList.innerHTML = '<div style="margin-bottom:8px; opacity:0.7; font-size:0.85rem;">已注册用户：</div>';
            result.users.forEach(user => {
                userList.innerHTML += `<div style="padding:4px 0; font-size:0.9rem;">${user === currentUsername ? '<i class="fas fa-user"></i> ' : '<i class="fas fa-user-circle"></i> '}${user}${user === currentUsername ? ' (当前)' : ''}</div>`;
            });
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

// 添加用户按钮
document.getElementById('btn-add-user').onclick = () => {
    document.getElementById('add-user-modal').classList.add('show');
    document.getElementById('new-username').value = '';
    document.getElementById('new-user-password').value = '';
    document.getElementById('add-user-error').style.display = 'none';
    document.getElementById('new-username').focus();
};

// 添加用户表单提交
document.getElementById('btn-add-user-submit').onclick = async () => {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const errorEl = document.getElementById('add-user-error');

    if (!username || !password) {
        errorEl.textContent = '请填写完整信息';
        errorEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Username': currentUsername,
            },
            body: JSON.stringify({ username, password }),
        });

        const result = await response.json();

        if (response.ok) {
            document.getElementById('add-user-modal').classList.remove('show');
            loadUserList();
            alert('用户添加成功');
        } else {
            errorEl.textContent = result.error || '添加失败';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = '网络错误，请重试';
        errorEl.style.display = 'block';
    }
};

// 验证登录状态（向后端查询）
async function checkSession() {
    try {
        const response = await fetch('/api/check-session');
        if (response.ok) {
            const result = await response.json();
            isLoggedIn = result.loggedIn;
            currentUsername = result.username || '';
        }
    } catch (error) {
        console.log('验证登录状态失败，默认未登录');
    }
}

// 初始化：先验证登录状态，再更新 UI
checkSession().then(() => {
    updateLoginUI();
});

// 回车键登录支持
document.getElementById('login-password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('btn-login-submit').click();
    }
});
document.getElementById('login-username').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('login-password').focus();
    }
});

// 统一给所有输入框添加 autocomplete="off"
document.querySelectorAll('input[type="text"]').forEach(input => {
    input.setAttribute('autocomplete', 'off');
});

// ====== 6. 拖拽功能 ======
// 拖拽模式切换
document.getElementById('btn-edit-mode').onclick = () => {
    isDragMode = !isDragMode;
    const btn = document.getElementById('btn-edit-mode');
    const icon = btn.querySelector('.icon-inner');
    
    if (isDragMode) {
        icon.className = 'icon-inner fas fa-save';
        btn.title = '退出拖拽模式';
        enableDragMode();
    } else {
        icon.className = 'icon-inner fas fa-edit';
        btn.title = '编辑模式';
        disableDragMode();
        saveConfig(); // 退出时保存
    }
};

// 启用拖拽模式 - 只让卡片可拖拽
function enableDragMode() {
    console.log('启用拖拽模式');
    document.body.classList.add('drag-mode');
    
    // 只给卡片添加拖拽属性，分组不可拖拽
    document.querySelectorAll('.nav-card').forEach(card => {
        card.setAttribute('draggable', 'true');
        card.classList.add('draggable');
        
        // 拖拽开始
        card.ondragstart = function(e) {
            console.log('卡片拖拽开始:', this.dataset.id);
            draggedElement = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.dataset.id || '');
            this.classList.add('dragging');
        };
        
        // 拖拽结束
        card.ondragend = function() {
            console.log('卡片拖拽结束');
            this.classList.remove('dragging');
            draggedElement = null;
            // 移除所有虚框
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        };
    });
    
    // 为卡片网格添加拖拽经过和放置事件
    document.querySelectorAll('.cards-grid').forEach(grid => {
        grid.ondragover = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
        };
        
        grid.ondragleave = function(e) {
            // 只有当鼠标真正离开网格时才移除虚框
            if (!this.contains(e.relatedTarget)) {
                this.classList.remove('drag-over');
            }
        };
        
        grid.ondrop = handleCardDrop;
    });
    
    // 为整个分组添加拖拽接收事件（处理拖拽到分组头部或空区域的情况）
    document.querySelectorAll('.group').forEach(group => {
        group.ondragover = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // 给分组的卡片网格添加虚框
            const grid = this.querySelector('.cards-grid');
            if (grid) grid.classList.add('drag-over');
        };
        
        group.ondragleave = function(e) {
            if (!this.contains(e.relatedTarget)) {
                const grid = this.querySelector('.cards-grid');
                if (grid) grid.classList.remove('drag-over');
            }
        };
        
        group.ondrop = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('卡片放置到分组');
            
            const grid = this.querySelector('.cards-grid');
            if (grid) {
                handleCardDrop.call(grid, e);
            }
        };
    });
}

// 处理卡片放置的通用函数
function handleCardDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('卡片放置到网格');
    
    this.classList.remove('drag-over');
    
    if (!draggedElement || !draggedElement.classList.contains('nav-card')) return;
    
    // 处理跨分组数据移动
    const sourceGroupEl = draggedElement.closest('.group');
    const targetGroupEl = this.closest('.group');
    
    if (sourceGroupEl && targetGroupEl && sourceGroupEl !== targetGroupEl) {
        const sourceGroupId = sourceGroupEl.querySelector('.group-header').dataset.id;
        const targetGroupId = targetGroupEl.querySelector('.group-header').dataset.id;
        
        console.log('跨分组移动: 从', sourceGroupId, '到', targetGroupId);
        
        const sourceGroup = appConfig.groups.find(g => g.id === sourceGroupId);
        const targetGroup = appConfig.groups.find(g => g.id === targetGroupId);
        
        if (sourceGroup && targetGroup) {
            const cardId = draggedElement.dataset.id;
            const linkIndex = sourceGroup.links.findIndex(l => l.id === cardId);
            
            if (linkIndex !== -1) {
                const [link] = sourceGroup.links.splice(linkIndex, 1);
                targetGroup.links.push(link);
                console.log('数据已移动:', link.title);
            }
        }
    }
    
    // 放置到目标网格的具体位置
    const afterCard = getDragAfterElement(this, e.clientY);
    
    if (afterCard) {
        this.insertBefore(draggedElement, afterCard);
    } else {
        this.appendChild(draggedElement);
    }
    
    updateOrder();
}

// 获取拖拽后应该插入的位置
function getDragAfterElement(grid, y) {
    const draggableElements = [...grid.querySelectorAll('.nav-card:not(.dragging)')];
    
    let closestElement = null;
    let closestOffset = Number.NEGATIVE_INFINITY;
    
    draggableElements.forEach(element => {
        const box = element.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closestElement = element;
        }
    });
    
    return closestElement;
}

// 禁用拖拽模式
function disableDragMode() {
    console.log('禁用拖拽模式');
    document.body.classList.remove('drag-mode');
    
    // 移除所有拖拽属性和事件
    document.querySelectorAll('[draggable="true"]').forEach(el => {
        el.removeAttribute('draggable');
        el.classList.remove('draggable');
        el.classList.remove('dragging');
        el.ondragstart = null;
        el.ondragend = null;
    });
    
    // 移除网格的拖拽事件
    document.querySelectorAll('.cards-grid').forEach(grid => {
        grid.ondragover = null;
        grid.ondragleave = null;
        grid.ondrop = null;
        grid.classList.remove('drag-over');
    });
}

// 更新配置顺序并保存
function updateOrder() {
    console.log('开始更新配置顺序...');
    
    // 先收集所有链接数据
    const allLinks = [];
    appConfig.groups.forEach(group => {
        group.links.forEach(link => {
            allLinks.push({ link, groupId: group.id });
        });
    });
    console.log('收集到', allLinks.length, '个链接');
    
    // 根据DOM重新构建分组和链接
    const newGroups = [];
    let totalLinks = 0;
    
    container.querySelectorAll('.group').forEach(groupEl => {
        const groupId = groupEl.querySelector('.group-header').dataset.id;
        const group = appConfig.groups.find(g => g.id === groupId);
        
        if (group) {
            // 根据DOM中的卡片顺序，从allLinks中查找对应的链接
            const newLinks = [];
            groupEl.querySelectorAll('.nav-card').forEach(cardEl => {
                const cardId = cardEl.dataset.id;
                const linkInfo = allLinks.find(li => li.link.id === cardId);
                if (linkInfo) {
                    newLinks.push(linkInfo.link);
                }
            });
            
            group.links = newLinks;
            newGroups.push(group);
            totalLinks += newLinks.length;
            console.log('分组', group.title, '有', newLinks.length, '个链接');
        }
    });
    
    appConfig.groups = newGroups;
    console.log('更新完成，共', newGroups.length, '个分组，', totalLinks, '个链接');
    
    // 保存到 localStorage
    saveConfig();
}

// ====== 7. 禁止浏览器默认拖拽行为 ======
// 禁止图片和链接的默认拖拽行为（不影响自定义拖拽）
document.addEventListener('dragstart', function(e) {
    const target = e.target;
    
    // 如果拖拽的是可拖拽的卡片，允许默认行为
    const card = target.closest ? target.closest('.nav-card') : null;
    if (card && card.getAttribute('draggable') === 'true') {
        return;
    }
    
    // 其他情况（图片、链接等）禁止默认拖拽行为
    e.preventDefault();
});

// ====== 8. 壁纸选择功能 ======
const WALLPAPER_COUNT = 12;
const WALLPAPER_PREFIX = 'wallpaper/';
wallpaperModal = document.getElementById('wallpaper-modal');

// 壁纸按钮点击 - 支持切换显示/隐藏
// 壁纸按钮点击 - 与设置按钮行为一致
document.getElementById('btn-wallpaper').onclick = (e) => {
    e.stopPropagation();
    const isShowing = wallpaperModal.classList.contains('show');
    wallpaperModal.classList.toggle('show');
    // 如果是打开状态，加载壁纸
    if (!isShowing) {
        loadWallpapers();
    }
};

// 加载壁纸列表
function loadWallpapers() {
    const grid = document.getElementById('wallpaper-grid');
    grid.innerHTML = '';
    
    // 加载壁纸图片
    for (let i = 1; i <= WALLPAPER_COUNT; i++) {
        const num = i.toString().padStart(3, '0');
        const imgPath = WALLPAPER_PREFIX + num + '.jpg';
        
        const item = document.createElement('div');
        item.className = 'wallpaper-item';
        item.dataset.wallpaper = imgPath;
        
        // 标记当前使用的壁纸
        if (appConfig.wallpaper === imgPath) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <img src="${imgPath}" alt="壁纸 ${num}" onerror="this.parentElement.style.display='none'">
            <i class="fas fa-check-circle check-icon"></i>
        `;
        
        item.onclick = () => selectWallpaper(imgPath);
        grid.appendChild(item);
    }
}

// 选择壁纸
function selectWallpaper(wallpaperPath) {
    appConfig.wallpaper = wallpaperPath;
    saveConfig();
    applyAppearance();
    document.getElementById('input-wallpaper').value = wallpaperPath;
    
    // 更新弹窗中的选中状态
    document.querySelectorAll('.wallpaper-item').forEach(item => {
        item.classList.toggle('active', item.dataset.wallpaper === wallpaperPath);
    });
}


