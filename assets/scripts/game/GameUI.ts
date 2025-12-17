import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('GameUI')
export class GameUI extends Component {

    private static _instance: GameUI = null;
    protected onLoad(): void {
        if (!GameUI._instance) {
            GameUI._instance = this;
        } else {
            GameUI._instance = this;
        }
    }
    public static getInstance(): GameUI {
        return GameUI._instance;
    }
    start() {
        (window as any).gameUI = this;
        
    }

    
}

