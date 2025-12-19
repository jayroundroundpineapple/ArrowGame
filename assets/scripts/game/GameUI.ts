import { _decorator, Color, Component, Graphics, Node, Prefab, Vec3, UITransform, EventTouch, UITransform as UITransformComp, Vec2 } from 'cc';
import { Macro } from './Macro';
import { GameManager } from './GameManager';
const { ccclass, property } = _decorator;

/**
 * 游戏UI组件
 * 负责UI显示和箭头绘制
 */
@ccclass('GameUI')
export class GameUI extends Component {
    @property(Graphics)
    private arrowGraphics: Graphics = null;
    @property(Node)
    private gameMapNode: Node = null;
    @property(Prefab)
    private mapRoundItemPre: Prefab = null;

    private gameManager: GameManager = null;

    protected onLoad(): void {
        // 初始化游戏管理器
        this.gameManager = GameManager.getInstance();
        this.gameManager.init(this.gameMapNode, this.mapRoundItemPre);
    }

    async start() {
        (window as any).gameUI = this;
        
        this.initGraphics();
        // 加载关卡
        await this.gameManager.loadLevel(1);
        // 初始化箭头路径
        this.gameManager.initArrowPaths();
        // 绘制箭头
        this.draw();
        
        // 确保箭头在圆圈上方
        if (this.arrowGraphics) {
            this.arrowGraphics.node.setSiblingIndex(999);
        }
        // 添加点击事件监听
        this.setupTouchEvents();
    }

    /**
     * 设置触摸事件
     */
    private setupTouchEvents(): void {
        // 在arrowGraphics节点上添加触摸监听
        if (this.arrowGraphics && this.arrowGraphics.node) {
            this.arrowGraphics.node.on(Node.EventType.TOUCH_END, this.onPathTouch, this);
        }
    }

    /**
     * 处理路径点击事件
     */
    private onPathTouch(event: EventTouch): void {
        console.log('=== 点击事件触发 ===');
        
        let touchWorldPos:Vec2 =event.getUILocation();
        let touchPos = this.gameMapNode.getComponent(UITransformComp).convertToNodeSpaceAR(new Vec3(touchWorldPos.x, touchWorldPos.y, 0));
        console.log('arrowGraphics世界坐标:', touchWorldPos.x, touchWorldPos.y);
        // console.log('arrowGraphics本地坐标:', arrowLocalPos.x, arrowLocalPos.y);
        
        // 由于arrowGraphics是gameMapNode的子节点，且位置是(0,0,0)
        // 所以arrowGraphics的本地坐标就是gameMapNode的本地坐标
        // 直接使用即可
        const finalX = touchPos.x;
        const finalY = touchPos.y;
        console.log('最终使用的坐标（gameMapNode坐标系）:', finalX, finalY);
        
        
        // 打印所有路径点用于调试
        const arrowPaths = this.gameManager.getArrowPaths();
        console.log('当前路径数量:', arrowPaths.length);
        for (let i = 0; i < arrowPaths.length; i++) {
            const path = arrowPaths[i];
            console.log(`路径 ${i} 有 ${path.length} 个点:`);
            for (let j = 0; j < path.length; j++) {
                const point = path[j];
                if (point && point.x !== null && point.y !== null) {
                    console.log(`  点 ${j}: (${point.x}, ${point.y})`);
                } else {
                    console.log(`  点 ${j}: null或无效`);
                }
            }
        }
        
        // 手动检查第一个路径的第一个线段，看看距离是多少
        if (arrowPaths.length > 0 && arrowPaths[0].length >= 2) {
            const path = arrowPaths[0];
            const startX = path[1].x;
            const startY = path[1].y;
            const endX = path[0].x;
            const endY = path[0].y;
            
            if (startX !== null && startY !== null && endX !== null && endY !== null) {
                const dx = finalX - startX;
                const dy = finalY - startY;
                const distToStart = Math.sqrt(dx * dx + dy * dy);
                console.log(`测试：点击点到路径0第一个线段起点的距离: ${distToStart.toFixed(2)}`);
                console.log(`      线段起点: (${startX}, ${startY}), 终点: (${endX}, ${endY})`);
            } else {
                console.log('路径0的点包含null值！');
            }
        }
        const hitPathIdx = this.gameManager.checkPathHit(finalX, finalY, 10);
        
        if (hitPathIdx >= 0) {
            console.log('✓ 点击到路径:', hitPathIdx);
            // 点击到了路径，开始移动
            this.startPathMovement(hitPathIdx);
            console.log(`开始移动路径 ${hitPathIdx}`);
        } else {
            console.log('✗ 未点击到任何路径');
        }
        console.log('=== 点击事件结束 ===\n');
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
     * 初始化Graphics组件
     */
    private initGraphics(): void {
        if (!this.arrowGraphics) {
            const graphicsNode = new Node();
            graphicsNode.addComponent(UITransform);
            graphicsNode.name = 'arrowGraphics';
            this.arrowGraphics = graphicsNode.addComponent(Graphics);
            graphicsNode.setParent(this.gameMapNode);
            graphicsNode.setPosition(new Vec3(0, 0, 0));
        }
        
        this.arrowGraphics.lineJoin = Graphics.LineJoin.MITER;
        this.arrowGraphics.miterLimit = 10;
        // 启用触摸事件（Graphics默认不接收触摸事件）
        const uiTransform = this.arrowGraphics.node.getComponent(UITransform);
        if (uiTransform) {
            // 设置足够大的触摸区域
            uiTransform.setContentSize(2000, 2000);
        }
    }

    /**
     * 更新循环 - 处理路径移动
     */
    update(deltaTime: number): void {
        if (this.isMoving && this.movingPathIndex >= 0) {
            // 移动路径
            this.gameManager.arrowPathMove(5, this.movingPathIndex);
            
            // 重新绘制
            this.draw();

            // 检查路径是否已离开地图
            if (this.gameManager.isPathLeftMap(this.movingPathIndex)) {
                const leftPathIdx = this.movingPathIndex; // 保存路径索引用于日志
                this.isMoving = false;
                this.movingPathIndex = -1;
                console.log(`路径 ${leftPathIdx} 已离开地图，停止移动`);

                if (this.gameManager.areAllPathsLeftMap()) {
                    console.log('所有路径都已离开地图，通关成功！');
                }
            }
        }
    }
    /**
     * 绘制箭头路径
     * 从GameManager获取路径数据并绘制
     */
    private draw(): void {
        if (!this.arrowGraphics) return;
        
        const arrowPaths = this.gameManager.getArrowPaths();
        if (arrowPaths.length === 0) return;

        this.arrowGraphics.clear();
        this.arrowGraphics.lineCap = Graphics.LineCap.ROUND;
        this.arrowGraphics.lineWidth = 12;
        this.arrowGraphics.strokeColor = new Color(0, 0, 0, 255);
        this.arrowGraphics.fillColor = new Color(0, 0, 0, 255);

        // 遍历所有路径
        for (let pathIndex = 0; pathIndex < arrowPaths.length; pathIndex++) {
            const path = arrowPaths[pathIndex];
            // 至少需要2个点才能绘制
            if (path.length < 2) continue;

            // 遍历当前路径的点，绘制每段线段
            for (let i = 0; i < path.length - 1; i++) {
                const startX = path[i + 1].x;
                const startY = path[i + 1].y;
                const endX = path[i].x;
                const endY = path[i].y;
                // 绘制线段
                this.arrowGraphics.moveTo(startX, startY);
                this.arrowGraphics.lineTo(endX, endY);
                this.arrowGraphics.stroke();
                // 在路径头部（第一个线段）绘制箭头
                if (i == 0) {
                    // 在路径头部绘制箭头，方向从起点指向终点
                    const dir = this.gameManager.getDir(startX, startY, endX, endY);
                    this.drawArrow(endX, endY, dir);
                }
            }
        }
    }
    private drawArrow(endX: number, endY: number, dir: { x: number, y: number }): void {
        this.arrowGraphics.moveTo(endX + dir.x * 15, endY + dir.y * 15);
        this.arrowGraphics.lineTo(endX - dir.y * 15, endY + dir.x * 15);
        this.arrowGraphics.lineTo(endX + dir.y * 15, endY - dir.x * 15);
        this.arrowGraphics.close();
        this.arrowGraphics.fillColor = (new Color(0, 0, 0, 255));
        this.arrowGraphics.fill();
    }
    

    /**
     * 清空所有箭头路径
     */
    public clearArrowPath(): void {
        this.gameManager.clearArrowPaths();
        if (this.arrowGraphics) {
            this.arrowGraphics.clear();
        }
    }

    /**
     * 添加一条新的箭头路径
     * @param points 路径点数组
     */
    public addArrowPath(points: { x: number, y: number }[]): void {
        this.gameManager.addArrowPath(points);
        this.draw();
    }

    /**
     * 设置所有箭头路径并重新绘制
     * @param paths 路径数组，每个元素是一条路径
     */
    public setArrowPaths(paths: { x: number, y: number }[][]): void {
        this.gameManager.setArrowPaths(paths);
        this.draw();
    }

    /**
     * 重新绘制箭头（公开方法，供外部调用）
     */
    public redrawArrows(): void {
        this.draw();
    }
}

