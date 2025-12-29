import { _decorator, Color, Component, Graphics, Node, Prefab, Vec3, UITransform, EventTouch, UITransform as UITransformComp, Vec2, instantiate } from 'cc';
import { Macro } from './Macro';
import { GameManager } from './GameManager';
import { GraphicsItem } from './GraphicsItem';
const { ccclass, property } = _decorator;

/**
 * 游戏UI组件
 * 负责UI显示和箭头绘制
 */
@ccclass('GameUI')
export class GameUI extends Component {
    @property(Node)
    private gameMapNode: Node = null;
    @property(Prefab)
    private mapRoundItemPre: Prefab = null;
    @property(Node)
    private graphicsContainer: Node = null; //Graphics 容器节点
    @property(Prefab)
    private graphicsItemPre: Prefab = null;

    private gameManager: GameManager = null;

    // private graphicsContainer: Node = null; //Graphics 容器节点
    // 每个路径对应一个 Graphics 组件
    private pathGraphics: Graphics[] = []; // 路径 Graphics 数组

    protected onLoad(): void {
        // 初始化游戏管理器
        this.gameManager = GameManager.getInstance();
        this.gameManager.init(this.gameMapNode, this.mapRoundItemPre);
    }

    async start() {
        (window as any).gameUI = this;
        // 加载关卡
        await this.gameManager.loadLevel(1);
        // 初始化箭头路径
        this.gameManager.initArrowPaths();
        this.initGraphicsContainer();
        // 创建所有路径的 Graphics
        this.createAllPathGraphics();
        // 添加点击事件监听
        this.setupTouchEvents();
    }

    /**
     * 设置触摸事件
     */
    private setupTouchEvents(): void {
        // 在容器节点上添加触摸监听
        if (this.graphicsContainer) {
            this.graphicsContainer.on(Node.EventType.TOUCH_END, this.onPathTouch, this);
        }
    }

    /**
     * 处理路径点击事件
     */
    private onPathTouch(event: EventTouch): void {
        let touchWorldPos: Vec2 = event.getUILocation();
        let touchPos = this.gameMapNode.getComponent(UITransformComp).convertToNodeSpaceAR(new Vec3(touchWorldPos.x, touchWorldPos.y, 0));
        console.log('arrowGraphics世界坐标:', touchWorldPos.x, touchWorldPos.y);

        const finalX = touchPos.x;
        const finalY = touchPos.y;
        console.log('最终使用的坐标（gameMapNode坐标系）:', finalX, finalY);


        // 打印所有路径点用于调试
        const arrowPaths = this.gameManager.getArrowPaths();
        for (let i = 0; i < arrowPaths.length; i++) {
            const path = arrowPaths[i];
            console.log(`路径 ${i} 有 ${path.length} 个点:`);
            for (let j = 0; j < path.length; j++) {
                const point = path[j];
                if (point && point.x !== null && point.y !== null) {
                    console.log(`点 ${j}: (${point.x}, ${point.y})`);
                } else {
                    console.log(`点 ${j}: null或无效`);
                }
            }
        }
        const hitPathIdx = this.gameManager.checkPathHit(finalX, finalY, 10);
        if (hitPathIdx >= 0) {
            console.log('✓ 点击到路径:', hitPathIdx);
            // 获取路径方向
            const path = this.gameManager.getArrowPaths()[hitPathIdx];
            if (!path || path.length < 2) {
                console.log('路径无效');
                return;
            }
            const startX = path[1].x;
            const startY = path[1].y;
            const endX = path[0].x;
            const endY = path[0].y;
            // 获取路径方向
            const dir = this.gameManager.getDir(startX, startY, endX, endY);

            // 检查路径在箭头方向上是否被其他路径阻挡（递归检查整行/整列）
            if (this.gameManager.isPathBlocked(hitPathIdx, dir)) {
                return;
            }
            // 点击到了路径，开始移动
            this.startPathMovement(hitPathIdx);
        } else {
            console.log('未点击到任何路径');
        }
    }
    /**
     * 开始路径移动
     * @param pathIdx 路径索引
     */
    private startPathMovement(pathIdx: number): void {
        // 如果路径已经在移动，不重复启动
        if (this.movingPathIndex === pathIdx) {
            return;
        }
        this.movingPathIndex = pathIdx;
        this.isMoving = true;
    }
    private movingPathIndex: number = -1; // 当前正在移动的路径索引
    private isMoving: boolean = false; // 是否正在移动
    /**
     * 初始化Graphics容器
     */
    private initGraphicsContainer(): void {
        // 确保容器在圆圈上方
        this.graphicsContainer.setSiblingIndex(999);
        // 启用触摸事件
        const uiTransform = this.graphicsContainer.getComponent(UITransform);
        if (uiTransform) {
            // 设置足够大的触摸区域
            uiTransform.setContentSize(2000, 2000);
        }
    }

    /**
     * 为所有路径创建 Graphics 组件
     */
    private createAllPathGraphics(): void {
        // 先清理之前的 Graphics
        this.clearAllPathGraphics();

        const arrowPaths = this.gameManager.getArrowPaths();
        for (let pathIndex = 0; pathIndex < arrowPaths.length; pathIndex++) {
            this.createPathGraphics(pathIndex);
        }
    }

    /**
     * 为指定路径创建 Graphics 组件
     * @param pathIndex 路径索引
     */
    private createPathGraphics(pathIndex: number): Graphics {
        const graphicsNode = instantiate(this.graphicsItemPre);
        graphicsNode.name = `ArrowPath_${pathIndex}`;
        graphicsNode.setParent(this.graphicsContainer);
        graphicsNode.setPosition(new Vec3(0, 0, 0));

        let graphics = graphicsNode.getComponent(Graphics);

        // 设置 Graphics 属性
        graphics.lineJoin = Graphics.LineJoin.MITER;
        graphics.miterLimit = 10;
        graphics.lineCap = Graphics.LineCap.ROUND;
        graphics.lineWidth = 12;
        graphics.strokeColor = new Color(0, 0, 0, 255);
        graphics.fillColor = new Color(0, 0, 0, 255);

        // 如果预制体有 GraphicsItem 组件，可以调用初始化方法
        const graphicsItem = graphicsNode.getComponent(GraphicsItem);
        if (graphicsItem && graphicsItem.initItem) {
            graphicsItem.initItem();
        }

        // 确保数组长度足够
        while (this.pathGraphics.length <= pathIndex) {
            this.pathGraphics.push(null);
        }
        this.pathGraphics[pathIndex] = graphics;

        // 绘制路径
        this.drawPath(pathIndex);

        return graphics;
    }

    /**
     * 清空所有路径 Graphics
     */
    private clearAllPathGraphics(): void {
        for (let i = 0; i < this.pathGraphics.length; i++) {
            if (this.pathGraphics[i] && this.pathGraphics[i].node) {
                this.pathGraphics[i].node.destroy();
            }
        }
        this.pathGraphics = [];
    }
    /**
     * 更新循环 - 处理路径移动
     */
    update(deltaTime: number): void {
        if (this.isMoving && this.movingPathIndex >= 0) {
            // 移动路径
            this.gameManager.arrowPathMove(8, this.movingPathIndex);
            // 重新绘制当前路径
            this.drawPath(this.movingPathIndex);
            // 检查路径是否已离开地图
            if (this.gameManager.isPathLeftMap(this.movingPathIndex)) {
                const leftPathIdx = this.movingPathIndex; // 保存路径索引用于日志
                this.isMoving = false;
                this.movingPathIndex = -1;
                console.log(`路径 ${leftPathIdx} 已离开地图，停止移动`);

                // 隐藏对应的 Graphics
                this.hidePathGraphics(leftPathIdx);

                if (this.gameManager.areAllPathsLeftMap()) {
                    console.log('所有路径都已离开地图，通关成功！');
                }
            }
        }
    }
    /**
     * 绘制指定路径的箭头
     * @param pathIndex 路径索引
     */
    private drawPath(pathIndex: number): void {
        // 检查路径是否已离开地图
        const pathLeftMap = this.gameManager.getPathLeftMap();
        if (pathLeftMap[pathIndex] === true) {
            // 如果已离开，隐藏 Graphics
            this.hidePathGraphics(pathIndex);
            return;
        }

        // 确保 Graphics 存在
        if (!this.pathGraphics[pathIndex]) {
            this.createPathGraphics(pathIndex);
            return;
        }

        const graphics = this.pathGraphics[pathIndex];
        const arrowPaths = this.gameManager.getArrowPaths();
        const path = arrowPaths[pathIndex];

        // 如果路径为空或长度小于2，清空并隐藏
        if (!path || path.length < 2) {
            graphics.clear();
            this.hidePathGraphics(pathIndex);
            return;
        }

        // 清空之前的绘制
        graphics.clear();

        // 遍历当前路径的点，绘制每段线段
        for (let i = 0; i < path.length - 1; i++) {
            const startX = path[i + 1].x;
            const startY = path[i + 1].y;
            const endX = path[i].x;
            const endY = path[i].y;
            // 绘制线段
            graphics.moveTo(startX, startY);
            graphics.lineTo(endX, endY);
            graphics.stroke();
            // 在路径头部（第一个线段）绘制箭头
            if (i == 0) {
                // 在路径头部绘制箭头，方向从起点指向终点
                const dir = this.gameManager.getDir(startX, startY, endX, endY);
                this.drawArrow(graphics, endX, endY, dir);
            }
        }

        // 确保 Graphics 节点可见
        if (graphics.node) {
            graphics.node.active = true;
        }
    }

    /**
     * 绘制箭头
     * @param graphics Graphics 组件
     * @param endX 箭头终点X
     * @param endY 箭头终点Y
     * @param dir 方向向量
     */
    private drawArrow(graphics: Graphics, endX: number, endY: number, dir: { x: number, y: number }): void {
        graphics.moveTo(endX + dir.x * 15, endY + dir.y * 15);
        graphics.lineTo(endX - dir.y * 15, endY + dir.x * 15);
        graphics.lineTo(endX + dir.y * 15, endY - dir.x * 15);
        graphics.close();
        graphics.fillColor = new Color(0, 0, 0, 255);
        graphics.fill();
    }

    /**
     * 隐藏指定路径的 Graphics
     * @param pathIndex 路径索引
     */
    private hidePathGraphics(pathIndex: number): void {
        if (this.pathGraphics[pathIndex] && this.pathGraphics[pathIndex].node) {
            // 方式1：设置透明度为0
            // this.pathGraphics[pathIndex].node.getComponent(UIOpacity).opacity = 0;

            // 方式2：直接隐藏节点（推荐）
            this.pathGraphics[pathIndex].node.active = false;

            // 也可以清空绘制内容
            this.pathGraphics[pathIndex].clear();
        }
    }


    /**
     * 清空所有箭头路径
     */
    public clearArrowPath(): void {
        this.gameManager.clearArrowPaths();
        this.clearAllPathGraphics();
    }

    /**
     * 添加一条新的箭头路径
     * @param points 路径点数组
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        this.gameManager.addArrowPath(points);
        const arrowPaths = this.gameManager.getArrowPaths();
        const newPathIndex = arrowPaths.length - 1;
        this.createPathGraphics(newPathIndex);
    }

    /**
     * 设置所有箭头路径并重新绘制
     * @param paths 路径数组，每个元素是一条路径
     */
    public setArrowPaths(paths: { x: number, y: number }[][]): void {
        this.gameManager.setArrowPaths(paths);
        this.createAllPathGraphics();
    }

    /**
     * 重新绘制所有箭头（公开方法，供外部调用）
     */
    public redrawArrows(): void {
        const arrowPaths = this.gameManager.getArrowPaths();
        for (let i = 0; i < arrowPaths.length; i++) {
            this.drawPath(i);
        }
    }
}

